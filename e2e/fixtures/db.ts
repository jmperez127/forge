import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { TEST_USERS } from './auth.js';

/**
 * Database test utilities.
 *
 * These helpers allow tests to create and manipulate test data directly
 * in PostgreSQL, bypassing the API for setup/teardown.
 */

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://forge:forge@localhost:5432/forge_test?sslmode=disable';

/**
 * Execute raw SQL against the test database.
 */
export function execSQL(sql: string): string {
  try {
    return execSync(`psql "${DATABASE_URL}" -t -c "${sql.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      env: { ...process.env, PGPASSWORD: 'forge' },
    }).trim();
  } catch (error) {
    console.error('SQL Error:', (error as Error).message);
    throw error;
  }
}

/**
 * Test organization ID.
 */
export const TEST_ORG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

/**
 * Create a test ticket.
 */
export function createTicket(options: {
  subject: string;
  description?: string;
  status?: 'open' | 'pending' | 'in_progress' | 'resolved' | 'closed';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  authorId?: string;
  assigneeId?: string;
}): string {
  const id = randomUUID();
  const {
    subject,
    description = 'Test ticket description',
    status = 'open',
    priority = 'medium',
    authorId = TEST_USERS.customer.id,
    assigneeId = null,
  } = options;

  const sql = `
    INSERT INTO tickets (id, subject, description, status, priority, org_id, author_id, assignee_id)
    VALUES (
      '${id}',
      '${subject.replace(/'/g, "''")}',
      '${description.replace(/'/g, "''")}',
      '${status}',
      '${priority}',
      '${TEST_ORG_ID}',
      '${authorId}',
      ${assigneeId ? `'${assigneeId}'` : 'NULL'}
    )
    RETURNING id;
  `;

  execSQL(sql);
  return id;
}

/**
 * Create a test comment.
 */
export function createComment(options: {
  ticketId: string;
  body: string;
  internal?: boolean;
  authorId?: string;
}): string {
  const id = randomUUID();
  const {
    ticketId,
    body,
    internal = false,
    authorId = TEST_USERS.agent.id,
  } = options;

  const sql = `
    INSERT INTO comments (id, ticket_id, body, internal, author_id)
    VALUES (
      '${id}',
      '${ticketId}',
      '${body.replace(/'/g, "''")}',
      ${internal},
      '${authorId}'
    )
    RETURNING id;
  `;

  execSQL(sql);
  return id;
}

/**
 * Get a ticket by ID.
 */
export function getTicket(id: string): Record<string, unknown> | null {
  const result = execSQL(`
    SELECT row_to_json(t) FROM (
      SELECT * FROM tickets WHERE id = '${id}'
    ) t;
  `);

  if (!result) return null;
  return JSON.parse(result);
}

/**
 * Delete a ticket.
 */
export function deleteTicket(id: string): void {
  execSQL(`DELETE FROM tickets WHERE id = '${id}';`);
}

/**
 * Clean all test tickets.
 */
export function cleanTickets(): void {
  execSQL('DELETE FROM comments WHERE TRUE;');
  execSQL('DELETE FROM tickets WHERE TRUE;');
}

/**
 * Update ticket status.
 */
export function updateTicketStatus(
  id: string,
  status: 'open' | 'pending' | 'in_progress' | 'resolved' | 'closed'
): void {
  execSQL(`UPDATE tickets SET status = '${status}' WHERE id = '${id}';`);
}

/**
 * Count tickets matching criteria.
 */
export function countTickets(where?: string): number {
  const result = execSQL(
    `SELECT COUNT(*) FROM tickets ${where ? `WHERE ${where}` : ''};`
  );
  return parseInt(result, 10);
}
