import { Page, request } from '@playwright/test';

/**
 * Test user credentials and IDs.
 */
export const TEST_USERS = {
  admin: {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'admin@test.com',
    name: 'Admin User',
    role: 'admin' as const,
  },
  agent: {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'agent@test.com',
    name: 'Agent User',
    role: 'agent' as const,
  },
  customer: {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'customer@test.com',
    name: 'Customer User',
    role: 'customer' as const,
  },
};

export type TestUserRole = keyof typeof TEST_USERS;

/**
 * Authenticate as a test user.
 *
 * For the E2E tests, we simulate authentication by:
 * 1. Setting a token in localStorage that the frontend SDK reads
 * 2. Setting the Authorization header for API requests
 *
 * In production, this would go through the actual OAuth flow.
 */
export async function authenticateAs(
  page: Page,
  role: TestUserRole
): Promise<void> {
  const user = TEST_USERS[role];

  // Create a mock JWT token (for testing purposes)
  // In a real app, this would be a valid JWT
  const mockToken = btoa(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      exp: Date.now() + 3600000, // 1 hour
    })
  );

  // Set token in localStorage before navigating
  await page.addInitScript((token: string) => {
    window.localStorage.setItem('forge_token', token);
  }, mockToken);
}

/**
 * Create an authenticated API context for direct API calls.
 */
export async function createAuthenticatedContext(
  role: TestUserRole
): Promise<ReturnType<typeof request.newContext>> {
  const user = TEST_USERS[role];
  const mockToken = btoa(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      exp: Date.now() + 3600000,
    })
  );

  return request.newContext({
    baseURL: 'http://localhost:8080',
    extraHTTPHeaders: {
      Authorization: `Bearer ${mockToken}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Clear authentication.
 */
export async function clearAuth(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.localStorage.removeItem('forge_token');
  });
}

// Base64 encode helper for Node.js
function btoa(str: string): string {
  return Buffer.from(str).toString('base64');
}
