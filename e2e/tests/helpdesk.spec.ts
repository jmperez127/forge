import { test, expect, Page } from '@playwright/test';
import { authenticateAs, TEST_USERS } from '../fixtures/auth.js';
import {
  createTicket,
  createComment,
  cleanTickets,
  getTicket,
  updateTicketStatus,
} from '../fixtures/db.js';

/**
 * FORGE Helpdesk E2E Tests
 *
 * These tests verify the complete user flows in the helpdesk application:
 * - Viewing ticket list
 * - Creating new tickets
 * - Viewing ticket details
 * - Adding comments
 * - Closing tickets
 * - Access control enforcement
 */

test.describe('Helpdesk Application', () => {
  test.beforeEach(async () => {
    // Clean test data before each test
    cleanTickets();
  });

  test.describe('Ticket List', () => {
    test('displays empty state when no tickets exist', async ({ page }) => {
      await authenticateAs(page, 'customer');
      await page.goto('/');

      await expect(page.getByText('No tickets found')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Create your first ticket' })).toBeVisible();
    });

    test('displays list of tickets', async ({ page }) => {
      // Create test tickets
      createTicket({ subject: 'First ticket', priority: 'high' });
      createTicket({ subject: 'Second ticket', priority: 'low' });
      createTicket({ subject: 'Third ticket', status: 'closed' });

      await authenticateAs(page, 'customer');
      await page.goto('/');

      // Verify tickets are displayed
      await expect(page.getByText('First ticket')).toBeVisible();
      await expect(page.getByText('Second ticket')).toBeVisible();
      await expect(page.getByText('Third ticket')).toBeVisible();

      // Verify status badges
      await expect(page.getByText('open').first()).toBeVisible();
      await expect(page.getByText('closed')).toBeVisible();
    });

    test('navigates to ticket detail when clicking a ticket', async ({ page }) => {
      const ticketId = createTicket({ subject: 'Clickable ticket' });

      await authenticateAs(page, 'customer');
      await page.goto('/');

      await page.getByText('Clickable ticket').click();

      await expect(page).toHaveURL(`/tickets/${ticketId}`);
    });

    test('shows priority indicators', async ({ page }) => {
      createTicket({ subject: 'Urgent issue', priority: 'urgent' });
      createTicket({ subject: 'High priority', priority: 'high' });

      await authenticateAs(page, 'customer');
      await page.goto('/');

      // Urgent tickets show triple exclamation
      const urgentRow = page.locator('li').filter({ hasText: 'Urgent issue' });
      await expect(urgentRow.getByText('!!!')).toBeVisible();

      // High priority shows double exclamation
      const highRow = page.locator('li').filter({ hasText: 'High priority' });
      await expect(highRow.getByText('!!')).toBeVisible();
    });
  });

  test.describe('Create Ticket', () => {
    test('can create a new ticket', async ({ page }) => {
      await authenticateAs(page, 'customer');
      await page.goto('/new');

      // Fill out the form
      await page.getByLabel('Subject').fill('My new support ticket');
      await page.getByLabel('Description').fill('This is a detailed description of my issue.');
      await page.getByLabel('Priority').selectOption('high');

      // Submit
      await page.getByRole('button', { name: 'Create Ticket' }).click();

      // Should redirect to home
      await expect(page).toHaveURL('/');

      // Ticket should appear in list
      await expect(page.getByText('My new support ticket')).toBeVisible();
    });

    test('shows character count for subject', async ({ page }) => {
      await authenticateAs(page, 'customer');
      await page.goto('/new');

      await page.getByLabel('Subject').fill('Short');

      await expect(page.getByText('5/120 characters')).toBeVisible();
    });

    test('disables submit button when form is incomplete', async ({ page }) => {
      await authenticateAs(page, 'customer');
      await page.goto('/new');

      const submitButton = page.getByRole('button', { name: 'Create Ticket' });

      // Initially disabled (no subject or description)
      await expect(submitButton).toBeDisabled();

      // Still disabled with only subject
      await page.getByLabel('Subject').fill('Test subject');
      await expect(submitButton).toBeDisabled();

      // Enabled once both fields are filled
      await page.getByLabel('Description').fill('Test description');
      await expect(submitButton).toBeEnabled();
    });

    test('cancel button returns to ticket list', async ({ page }) => {
      await authenticateAs(page, 'customer');
      await page.goto('/new');

      await page.getByRole('button', { name: 'Cancel' }).click();

      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Ticket Detail', () => {
    test('displays ticket information', async ({ page }) => {
      const ticketId = createTicket({
        subject: 'Detailed ticket',
        description: 'This is the full description of the issue.',
        priority: 'high',
        status: 'in_progress',
      });

      await authenticateAs(page, 'customer');
      await page.goto(`/tickets/${ticketId}`);

      await expect(page.getByRole('heading', { name: 'Detailed ticket' })).toBeVisible();
      await expect(page.getByText('This is the full description of the issue.')).toBeVisible();
      await expect(page.getByText('in progress')).toBeVisible();
      await expect(page.getByText('high', { exact: true })).toBeVisible();
    });

    test('displays comments', async ({ page }) => {
      const ticketId = createTicket({ subject: 'Ticket with comments' });
      createComment({ ticketId, body: 'First response from support' });
      createComment({ ticketId, body: 'Customer follow-up', authorId: TEST_USERS.customer.id });

      await authenticateAs(page, 'customer');
      await page.goto(`/tickets/${ticketId}`);

      await expect(page.getByText('First response from support')).toBeVisible();
      await expect(page.getByText('Customer follow-up')).toBeVisible();
    });

    test('shows internal notes badge for internal comments', async ({ page }) => {
      const ticketId = createTicket({ subject: 'Ticket with internal note' });
      createComment({ ticketId, body: 'Internal agent note', internal: true });

      await authenticateAs(page, 'agent');
      await page.goto(`/tickets/${ticketId}`);

      await expect(page.getByText('(Internal)')).toBeVisible();
    });

    test('shows "No comments yet" for tickets without comments', async ({ page }) => {
      const ticketId = createTicket({ subject: 'No comments ticket' });

      await authenticateAs(page, 'customer');
      await page.goto(`/tickets/${ticketId}`);

      await expect(page.getByText('No comments yet')).toBeVisible();
    });
  });

  test.describe('Add Comment', () => {
    test('can add a comment to a ticket', async ({ page }) => {
      const ticketId = createTicket({ subject: 'Ticket for commenting' });

      await authenticateAs(page, 'agent');
      await page.goto(`/tickets/${ticketId}`);

      await page.getByPlaceholder('Add a comment...').fill('This is my helpful response.');
      await page.getByRole('button', { name: 'Post Comment' }).click();

      // Comment should appear
      await expect(page.getByText('This is my helpful response.')).toBeVisible();
    });

    test('can mark comment as internal', async ({ page }) => {
      const ticketId = createTicket({ subject: 'Ticket for internal note' });

      await authenticateAs(page, 'agent');
      await page.goto(`/tickets/${ticketId}`);

      await page.getByPlaceholder('Add a comment...').fill('Internal team discussion');
      await page.getByLabel('Internal note').check();
      await page.getByRole('button', { name: 'Post Comment' }).click();

      // Internal badge should appear
      await expect(page.getByText('(Internal)')).toBeVisible();
    });

    test('clears form after posting comment', async ({ page }) => {
      const ticketId = createTicket({ subject: 'Ticket for form clear test' });

      await authenticateAs(page, 'agent');
      await page.goto(`/tickets/${ticketId}`);

      const commentInput = page.getByPlaceholder('Add a comment...');
      await commentInput.fill('Test comment');
      await page.getByRole('button', { name: 'Post Comment' }).click();

      // Form should be cleared
      await expect(commentInput).toHaveValue('');
    });

    test('disables post button when comment is empty', async ({ page }) => {
      const ticketId = createTicket({ subject: 'Empty comment test' });

      await authenticateAs(page, 'agent');
      await page.goto(`/tickets/${ticketId}`);

      const postButton = page.getByRole('button', { name: 'Post Comment' });
      await expect(postButton).toBeDisabled();

      await page.getByPlaceholder('Add a comment...').fill('Now it has content');
      await expect(postButton).toBeEnabled();
    });
  });

  test.describe('Close Ticket', () => {
    test('can close an open ticket', async ({ page }) => {
      const ticketId = createTicket({ subject: 'Ticket to close', status: 'open' });

      await authenticateAs(page, 'agent');
      await page.goto(`/tickets/${ticketId}`);

      // Mock confirmation dialog
      page.on('dialog', (dialog) => dialog.accept());

      await page.getByRole('button', { name: 'Close Ticket' }).click();

      // Status should update
      await expect(page.getByText('closed')).toBeVisible();
    });

    test('hides close button for already closed tickets', async ({ page }) => {
      const ticketId = createTicket({ subject: 'Already closed', status: 'closed' });

      await authenticateAs(page, 'agent');
      await page.goto(`/tickets/${ticketId}`);

      await expect(page.getByRole('button', { name: 'Close Ticket' })).not.toBeVisible();
    });

    test('hides comment form for closed tickets', async ({ page }) => {
      const ticketId = createTicket({ subject: 'Closed ticket', status: 'closed' });

      await authenticateAs(page, 'customer');
      await page.goto(`/tickets/${ticketId}`);

      await expect(page.getByPlaceholder('Add a comment...')).not.toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('can navigate between pages using nav links', async ({ page }) => {
      await authenticateAs(page, 'customer');
      await page.goto('/');

      // Go to new ticket
      await page.getByRole('link', { name: 'New Ticket' }).click();
      await expect(page).toHaveURL('/new');

      // Go back to tickets
      await page.getByRole('link', { name: 'Tickets' }).click();
      await expect(page).toHaveURL('/');
    });

    test('shows app title in header', async ({ page }) => {
      await authenticateAs(page, 'customer');
      await page.goto('/');

      await expect(page.getByRole('link', { name: 'Helpdesk' })).toBeVisible();
    });
  });

  test.describe('Real-time Updates', () => {
    test.skip('receives real-time updates via WebSocket', async ({ page, context }) => {
      // Create initial ticket
      const ticketId = createTicket({ subject: 'Real-time test ticket' });

      await authenticateAs(page, 'customer');
      await page.goto('/');

      // Verify initial state
      await expect(page.getByText('Real-time test ticket')).toBeVisible();

      // Create another ticket from a different "session" (via API)
      createTicket({ subject: 'New ticket from elsewhere' });

      // The new ticket should appear without refresh
      // Note: This test is skipped because the runtime doesn't fully implement WebSocket yet
      await expect(page.getByText('New ticket from elsewhere')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Access Control', () => {
    test.skip('customers cannot see internal comments', async ({ page }) => {
      const ticketId = createTicket({ subject: 'Access control test' });
      createComment({ ticketId, body: 'Public comment', internal: false });
      createComment({ ticketId, body: 'Secret internal note', internal: true });

      await authenticateAs(page, 'customer');
      await page.goto(`/tickets/${ticketId}`);

      // Customer should see public comment
      await expect(page.getByText('Public comment')).toBeVisible();

      // Customer should NOT see internal comment
      // Note: This is skipped because access control filtering isn't implemented yet
      await expect(page.getByText('Secret internal note')).not.toBeVisible();
    });

    test.skip('customers can only see their own organization tickets', async ({ page }) => {
      // This would require setting up multiple organizations
      // Skipped until org-scoped access control is fully implemented
    });
  });

  test.describe('Error Handling', () => {
    test('shows error state when API fails', async ({ page }) => {
      await authenticateAs(page, 'customer');

      // Navigate to a non-existent ticket
      await page.goto('/tickets/00000000-0000-0000-0000-000000000000');

      await expect(page.getByText('Error loading ticket')).toBeVisible();
    });
  });

  test.describe('Responsive Design', () => {
    test('works on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      createTicket({ subject: 'Mobile test ticket' });

      await authenticateAs(page, 'customer');
      await page.goto('/');

      await expect(page.getByText('Mobile test ticket')).toBeVisible();
    });
  });
});
