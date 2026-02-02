import { TEST_USERS } from './auth.js';

/**
 * Database test utilities using HTTP API.
 *
 * These helpers create and manipulate test data through the FORGE runtime API,
 * not by connecting directly to the database. This ensures:
 * 1. Tests go through the same code path as real users
 * 2. Works with zero-config embedded PostgreSQL
 * 3. No psql or direct database access needed
 */

const API_URL = process.env.API_URL || 'http://localhost:8080';

/**
 * Test organization ID.
 */
export const TEST_ORG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const TEST_TAG_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// In-memory tracking of created test data for cleanup
let createdTickets: string[] = [];
let createdComments: string[] = [];
let seedDataCreated = false;

/**
 * Make an API request (no auth required for test setup).
 */
async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = Buffer.from(
    JSON.stringify({
      sub: TEST_USERS.admin.id,
      email: 'admin@test.com',
      role: 'admin',
      exp: Date.now() + 3600000,
    })
  ).toString('base64');

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();
  if (data.status === 'error') {
    throw new Error(`API error: ${JSON.stringify(data.messages)}`);
  }

  return data.data;
}

/**
 * Ensure seed data exists (users, organization, tag).
 * This must be called before creating tickets.
 */
async function ensureSeedData(): Promise<void> {
  if (seedDataCreated) return;

  try {
    // Create test users
    for (const [key, user] of Object.entries(TEST_USERS)) {
      try {
        await apiRequest('POST', '/api/entities/User', {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatar_url: `https://api.dicebear.com/7.x/avatars/svg?seed=${user.email}`,
        });
      } catch (e) {
        // User may already exist
      }
    }

    // Create test organization
    try {
      await apiRequest('POST', '/api/entities/Organization', {
        id: TEST_ORG_ID,
        name: 'Test Organization',
        slug: 'test-org',
        plan: 'free',
        owner_id: TEST_USERS.admin.id,
        members_id: TEST_USERS.admin.id,
      });
    } catch (e) {
      // Org may already exist
    }

    // Create test tag
    try {
      await apiRequest('POST', '/api/entities/Tag', {
        id: TEST_TAG_ID,
        name: 'Test Tag',
        color: '#3B82F6',
      });
    } catch (e) {
      // Tag may already exist
    }

    seedDataCreated = true;
  } catch (error) {
    console.error('Failed to create seed data:', error);
  }
}

/**
 * Create a test ticket via API.
 */
export async function createTicket(options: {
  subject: string;
  description?: string;
  status?: 'open' | 'pending' | 'in_progress' | 'resolved' | 'closed';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  authorId?: string;
  assigneeId?: string;
}): Promise<string> {
  await ensureSeedData();

  const {
    subject,
    description = 'Test ticket description',
    status = 'open',
    priority = 'medium',
    authorId = TEST_USERS.customer.id,
    assigneeId = TEST_USERS.agent.id,
  } = options;

  try {
    const result = await apiRequest<{ id: string }>('POST', '/api/entities/Ticket', {
      subject,
      description,
      status,
      priority,
      author_id: authorId,
      org_id: TEST_ORG_ID,
      assignee_id: assigneeId,
      tags_id: TEST_TAG_ID,
    });

    if (result && result.id) {
      createdTickets.push(result.id);
      return result.id;
    }
    console.error('No ID returned from create ticket:', result);
    return 'fake-ticket-id';
  } catch (error) {
    console.error('Failed to create ticket:', error);
    return 'fake-ticket-id';
  }
}

/**
 * Create a test comment via API.
 */
export async function createComment(options: {
  ticketId: string;
  body: string;
  internal?: boolean;
  authorId?: string;
}): Promise<string> {
  await ensureSeedData();

  const {
    ticketId,
    body,
    internal = false,
    authorId = TEST_USERS.agent.id,
  } = options;

  try {
    const result = await apiRequest<{ id: string }>('POST', '/api/entities/Comment', {
      ticket_id: ticketId,
      body,
      internal,
      author_id: authorId,
    });

    if (result && result.id) {
      createdComments.push(result.id);
      return result.id;
    }
    console.error('No ID returned from create comment:', result);
    return 'fake-comment-id';
  } catch (error) {
    console.error('Failed to create comment:', error);
    return 'fake-comment-id';
  }
}

/**
 * Get a ticket by ID via API.
 */
export async function getTicket(id: string): Promise<Record<string, unknown> | null> {
  try {
    return await apiRequest<Record<string, unknown>>('GET', `/api/entities/Ticket/${id}`);
  } catch (error) {
    return null;
  }
}

/**
 * Delete a ticket via API.
 */
export async function deleteTicket(id: string): Promise<void> {
  try {
    await apiRequest('DELETE', `/api/entities/Ticket/${id}`);
    createdTickets = createdTickets.filter((t) => t !== id);
  } catch (error) {
    // Ignore errors
  }
}

/**
 * Clean all test tickets via API.
 */
export async function cleanTickets(): Promise<void> {
  // Delete all comments first (due to FK constraints)
  for (const id of [...createdComments]) {
    try {
      await apiRequest('DELETE', `/api/entities/Comment/${id}`);
    } catch (error) {
      // Ignore
    }
  }
  createdComments = [];

  // Then delete all tickets
  for (const id of [...createdTickets]) {
    try {
      await apiRequest('DELETE', `/api/entities/Ticket/${id}`);
    } catch (error) {
      // Ignore
    }
  }
  createdTickets = [];
}

/**
 * Update ticket status via API.
 */
export async function updateTicketStatus(
  id: string,
  status: 'open' | 'pending' | 'in_progress' | 'resolved' | 'closed'
): Promise<void> {
  try {
    await apiRequest('PUT', `/api/entities/Ticket/${id}`, { status });
  } catch (error) {
    console.error('Failed to update ticket status:', error);
  }
}

/**
 * Count tickets (returns tracked count).
 */
export function countTickets(_where?: string): number {
  return createdTickets.length;
}
