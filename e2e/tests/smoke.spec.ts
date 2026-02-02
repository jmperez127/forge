import { test, expect } from '@playwright/test';

/**
 * Smoke Tests
 *
 * These tests verify the basic infrastructure is working:
 * - Frontend loads
 * - Backend API responds
 * - Health endpoint works
 */

test.describe('Smoke Tests', () => {
  test('frontend loads', async ({ page }) => {
    await page.goto('/');

    // The app title in the header should be visible
    await expect(page.getByRole('link', { name: 'Helpdesk' })).toBeVisible();
  });

  test('backend health endpoint responds', async ({ request }) => {
    const response = await request.get('http://localhost:8080/health');

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.data.status).toBe('healthy');
    expect(body.data.app).toBe('Helpdesk');
  });

  test('API returns views list', async ({ request }) => {
    const response = await request.get('http://localhost:8080/api/views/TicketList');

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test('debug artifact endpoint works', async ({ request }) => {
    const response = await request.get('http://localhost:8080/debug/artifact');

    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.data.app_name).toBe('Helpdesk');
    expect(body.data.entities).toBeDefined();
    expect(body.data.actions).toBeDefined();
    expect(body.data.views).toBeDefined();
  });
});
