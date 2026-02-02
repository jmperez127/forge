import { Page, request } from '@playwright/test';

/**
 * Test user credentials and IDs for chat application.
 */
export const CHAT_TEST_USERS = {
  owner: {
    id: 'c1111111-1111-1111-1111-111111111111',
    email: 'owner@acme.test',
    name: 'Workspace Owner',
    role: 'owner' as const,
  },
  admin: {
    id: 'c2222222-2222-2222-2222-222222222222',
    email: 'admin@acme.test',
    name: 'Admin User',
    role: 'admin' as const,
  },
  member1: {
    id: 'c3333333-3333-3333-3333-333333333333',
    email: 'alice@acme.test',
    name: 'Alice Chen',
    role: 'member' as const,
  },
  member2: {
    id: 'c4444444-4444-4444-4444-444444444444',
    email: 'bob@acme.test',
    name: 'Bob Smith',
    role: 'member' as const,
  },
  outsider: {
    id: 'c5555555-5555-5555-5555-555555555555',
    email: 'outsider@other.test',
    name: 'Outside User',
    role: 'member' as const,
  },
};

export type ChatTestUserRole = keyof typeof CHAT_TEST_USERS;

/**
 * Authenticate as a chat test user.
 */
export async function authenticateChatUser(
  page: Page,
  role: ChatTestUserRole
): Promise<void> {
  const user = CHAT_TEST_USERS[role];

  const mockToken = btoa(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      workspace_id: TEST_WORKSPACE_ID,
      exp: Date.now() + 3600000,
    })
  );

  await page.addInitScript((token: string) => {
    window.localStorage.setItem('forge_token', token);
  }, mockToken);
}

/**
 * Create an authenticated API context for direct API calls.
 */
export async function createChatAuthContext(
  role: ChatTestUserRole
): Promise<ReturnType<typeof request.newContext>> {
  const user = CHAT_TEST_USERS[role];
  const mockToken = btoa(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      workspace_id: TEST_WORKSPACE_ID,
      exp: Date.now() + 3600000,
    })
  );

  return request.newContext({
    baseURL: CHAT_API_URL,
    extraHTTPHeaders: {
      Authorization: `Bearer ${mockToken}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Clear authentication.
 */
export async function clearChatAuth(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.localStorage.removeItem('forge_token');
  });
}

// Test constants
export const CHAT_API_URL = process.env.CHAT_API_URL || 'http://localhost:8080';
export const TEST_WORKSPACE_ID = 'waaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const TEST_GENERAL_CHANNEL_ID = 'chbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
export const TEST_PRIVATE_CHANNEL_ID = 'chcccccc-cccc-cccc-cccc-cccccccccccc';

function btoa(str: string): string {
  return Buffer.from(str).toString('base64');
}
