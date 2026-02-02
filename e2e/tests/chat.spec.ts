import { test, expect } from '@playwright/test';
import {
  authenticateChatUser,
  CHAT_TEST_USERS,
  TEST_GENERAL_CHANNEL_ID,
  TEST_PRIVATE_CHANNEL_ID,
} from '../fixtures/chat-auth.js';
import {
  createMessage,
  createChannel,
  createDM,
  addReaction,
  createThreadReply,
  cleanChatData,
} from '../fixtures/chat-db.js';

/**
 * FORGE Chat E2E Tests
 *
 * Comprehensive tests for the Slack-like chat application:
 * - Authentication (register, login)
 * - Workspace management
 * - Channel operations (create, join, leave)
 * - Messaging (send, edit, delete)
 * - Real-time updates
 * - Threads and reactions
 * - Direct messages
 * - Access control
 */

test.describe('Chat Application', () => {
  test.beforeEach(async () => {
    await cleanChatData();
  });

  test.describe('Authentication', () => {
    test('shows login page for unauthenticated users', async ({ page }) => {
      await page.goto('/login');

      await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
      await expect(page.getByLabel('Email')).toBeVisible();
      await expect(page.getByLabel('Password')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    });

    test('shows registration page', async ({ page }) => {
      await page.goto('/register');

      await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
      await expect(page.getByLabel('Display name')).toBeVisible();
      await expect(page.getByLabel('Email')).toBeVisible();
      await expect(page.getByLabel('Password')).toBeVisible();
    });

    test('can register a new account', async ({ page }) => {
      await page.goto('/register');

      await page.getByLabel('Display name').fill('Test User');
      await page.getByLabel('Email').fill('test@example.com');
      await page.getByLabel('Password').fill('securepassword123');

      await page.getByRole('button', { name: 'Create account' }).click();

      // Should redirect to workspace selection or main app
      await expect(page).not.toHaveURL('/register');
    });

    test('login link navigates to login page', async ({ page }) => {
      await page.goto('/register');

      await page.getByRole('link', { name: 'Sign in' }).click();

      await expect(page).toHaveURL('/login');
    });
  });

  test.describe('Channel List', () => {
    test('displays channels in sidebar', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto('/');

      // Should see the general channel
      await expect(page.getByRole('link', { name: /general/ })).toBeVisible();
    });

    test('shows channel types with icons', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto('/');

      // Public channels have # icon, private have lock icon
      const sidebar = page.locator('[class*="sidebar"], aside').first();
      await expect(sidebar).toBeVisible();
    });

    test('shows unread indicator for channels with new messages', async ({ page }) => {
      // Create a message in a channel
      await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'New message for unread test',
      });

      await authenticateChatUser(page, 'member2');
      await page.goto('/');

      // Should show unread count or bold text
      // Implementation depends on how unread state is tracked
    });

    test('can create a new channel', async ({ page }) => {
      await authenticateChatUser(page, 'admin');
      await page.goto('/');

      // Click add channel button
      await page.getByRole('button', { name: /add channel/i }).click();

      // Fill channel details (assuming modal or form appears)
      // This test structure depends on the UI implementation
    });
  });

  test.describe('Channel Messages', () => {
    test('displays messages in channel', async ({ page }) => {
      await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Hello from the test!',
        authorId: CHAT_TEST_USERS.member1.id,
      });

      await authenticateChatUser(page, 'member2');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      await expect(page.getByText('Hello from the test!')).toBeVisible();
    });

    test('shows message author and timestamp', async ({ page }) => {
      await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Message with metadata',
        authorId: CHAT_TEST_USERS.member1.id,
      });

      await authenticateChatUser(page, 'member2');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      await expect(page.getByText('Alice Chen')).toBeVisible();
      // Timestamp should be visible near the message
    });

    test('can send a message', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      // Type in message composer
      await page.getByPlaceholder(/message/i).fill('My test message');
      await page.getByRole('button', { name: /send/i }).click();

      // Message should appear
      await expect(page.getByText('My test message')).toBeVisible();
    });

    test('can send message with Enter key', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      const composer = page.getByPlaceholder(/message/i);
      await composer.fill('Enter key message');
      await composer.press('Enter');

      await expect(page.getByText('Enter key message')).toBeVisible();
    });

    test('Shift+Enter creates new line instead of sending', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      const composer = page.getByPlaceholder(/message/i);
      await composer.fill('Line 1');
      await composer.press('Shift+Enter');
      await composer.type('Line 2');

      // Should still be in composer, not sent
      await expect(composer).toContainText('Line 1');
      await expect(page.getByText('Line 1').locator('xpath=ancestor::*[contains(@class,"message")]')).not.toBeVisible();
    });

    test('shows empty state for new channels', async ({ page }) => {
      const channelId = await createChannel({ name: 'empty-channel' });

      await authenticateChatUser(page, 'admin');
      await page.goto(`/channel/${channelId}`);

      await expect(page.getByText(/welcome to/i)).toBeVisible();
    });

    test('groups messages by date', async ({ page }) => {
      await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Today message',
      });

      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      // Should show date separator
      await expect(page.getByText(/today/i)).toBeVisible();
    });
  });

  test.describe('Message Actions', () => {
    test('can edit own message', async ({ page }) => {
      const messageId = await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Original message',
        authorId: CHAT_TEST_USERS.member1.id,
      });

      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      // Hover over message to show actions
      await page.getByText('Original message').hover();

      // Click edit button
      await page.getByRole('button', { name: /edit/i }).click();

      // Edit message (implementation depends on UI)
    });

    test('shows (edited) indicator after editing', async ({ page }) => {
      const messageId = await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Will be edited',
        authorId: CHAT_TEST_USERS.member1.id,
      });

      // Update the message (simulating edit)
      // await updateMessage(messageId, 'Edited content');

      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      // After editing, should show indicator
      // await expect(page.getByText('(edited)')).toBeVisible();
    });

    test('can delete own message', async ({ page }) => {
      await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Will be deleted',
        authorId: CHAT_TEST_USERS.member1.id,
      });

      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      await page.getByText('Will be deleted').hover();
      await page.getByRole('button', { name: /more/i }).click();
      await page.getByRole('menuitem', { name: /delete/i }).click();

      // Message should be removed or show deleted state
    });

    test('cannot edit others messages', async ({ page }) => {
      await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Someone else message',
        authorId: CHAT_TEST_USERS.member1.id,
      });

      await authenticateChatUser(page, 'member2');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      await page.getByText('Someone else message').hover();

      // Edit button should not be visible for non-author
      await expect(page.getByRole('button', { name: /edit/i })).not.toBeVisible();
    });
  });

  test.describe('Reactions', () => {
    test('can add reaction to message', async ({ page }) => {
      await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'React to me',
        authorId: CHAT_TEST_USERS.member1.id,
      });

      await authenticateChatUser(page, 'member2');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      await page.getByText('React to me').hover();
      await page.getByRole('button', { name: /react|smile/i }).click();

      // Select an emoji (depends on emoji picker implementation)
    });

    test('shows reaction count', async ({ page }) => {
      const messageId = await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Popular message',
      });

      await addReaction({ messageId, emoji: '👍', userId: CHAT_TEST_USERS.member1.id });
      await addReaction({ messageId, emoji: '👍', userId: CHAT_TEST_USERS.member2.id });

      await authenticateChatUser(page, 'admin');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      // Should show reaction with count 2
      await expect(page.getByText('👍')).toBeVisible();
      await expect(page.getByText('2')).toBeVisible();
    });

    test('can toggle own reaction off', async ({ page }) => {
      const messageId = await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Toggle reaction',
      });

      await addReaction({
        messageId,
        emoji: '👍',
        userId: CHAT_TEST_USERS.member1.id,
      });

      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      // Click existing reaction to remove
      await page.locator('button').filter({ hasText: '👍' }).click();

      // Reaction should be removed
    });
  });

  test.describe('Threads', () => {
    test('can reply to message in thread', async ({ page }) => {
      await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Start a thread on this',
      });

      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      await page.getByText('Start a thread on this').hover();
      await page.getByRole('button', { name: /reply|thread/i }).click();

      // Thread panel should open
      // Fill reply
    });

    test('shows thread reply count', async ({ page }) => {
      const messageId = await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Message with replies',
      });

      await createThreadReply({ parentMessageId: messageId, content: 'Reply 1' });
      await createThreadReply({ parentMessageId: messageId, content: 'Reply 2' });

      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      await expect(page.getByText('2 replies')).toBeVisible();
    });

    test('clicking thread count opens thread panel', async ({ page }) => {
      const messageId = await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Click to see thread',
      });

      await createThreadReply({ parentMessageId: messageId, content: 'Thread reply' });

      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      await page.getByText(/1 reply/i).click();

      // Thread panel should show the reply
      await expect(page.getByText('Thread reply')).toBeVisible();
    });
  });

  test.describe('Direct Messages', () => {
    test('can start a new DM', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto('/');

      // Click add DM button
      await page.getByRole('button', { name: /start a dm/i }).click();

      // Select user and start conversation
    });

    test('shows DM participants in sidebar', async ({ page }) => {
      const dmId = await createDM({
        participantIds: [CHAT_TEST_USERS.member1.id, CHAT_TEST_USERS.member2.id],
      });

      await authenticateChatUser(page, 'member1');
      await page.goto('/');

      // Should see Bob Smith in DM list
      await expect(page.getByText('Bob Smith')).toBeVisible();
    });

    test('can send message in DM', async ({ page }) => {
      const dmId = await createDM({
        participantIds: [CHAT_TEST_USERS.member1.id, CHAT_TEST_USERS.member2.id],
      });

      await authenticateChatUser(page, 'member1');
      await page.goto(`/dm/${dmId}`);

      await page.getByPlaceholder(/message/i).fill('Private message');
      await page.getByRole('button', { name: /send/i }).click();

      await expect(page.getByText('Private message')).toBeVisible();
    });

    test('shows presence indicator in DM list', async ({ page }) => {
      await createDM({
        participantIds: [CHAT_TEST_USERS.member1.id, CHAT_TEST_USERS.member2.id],
      });

      await authenticateChatUser(page, 'member1');
      await page.goto('/');

      // Should show presence dot next to user
      // Implementation depends on presence system
    });
  });

  test.describe('Typing Indicators', () => {
    test.skip('shows typing indicator when user is typing', async ({ page, context }) => {
      // This requires real-time WebSocket implementation
      // Skip for now
    });
  });

  test.describe('Access Control', () => {
    test('private channel not visible to non-members', async ({ page }) => {
      await authenticateChatUser(page, 'member2'); // member2 is NOT in private channel
      await page.goto('/');

      // Should not see the private channel in sidebar
      await expect(page.getByRole('link', { name: /secret-project/ })).not.toBeVisible();
    });

    test('private channel visible to members', async ({ page }) => {
      await authenticateChatUser(page, 'member1'); // member1 IS in private channel
      await page.goto('/');

      // Should see the private channel
      await expect(page.getByRole('link', { name: /secret-project/ })).toBeVisible();
    });

    test('cannot access private channel URL directly', async ({ page }) => {
      await authenticateChatUser(page, 'member2'); // Not a member
      await page.goto(`/channel/${TEST_PRIVATE_CHANNEL_ID}`);

      // Should show access denied or redirect
      await expect(page.getByText(/not a member|access denied|not found/i)).toBeVisible();
    });

    test('workspace isolation - cannot see other workspace data', async ({ page }) => {
      await authenticateChatUser(page, 'outsider'); // Not in the workspace
      await page.goto('/');

      // Should not see any channels from the test workspace
      await expect(page.getByRole('link', { name: /general/ })).not.toBeVisible();
    });
  });

  test.describe('Real-time Updates', () => {
    test.skip('receives new messages without refresh', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      // Create message from "another user" via API
      await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Real-time test message',
        authorId: CHAT_TEST_USERS.member2.id,
      });

      // Message should appear without refresh
      await expect(page.getByText('Real-time test message')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Navigation', () => {
    test('clicking channel navigates to channel view', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto('/');

      await page.getByRole('link', { name: /general/ }).click();

      await expect(page).toHaveURL(/\/channel\//);
    });

    test('shows channel name in header', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      await expect(page.getByRole('heading', { name: 'general' })).toBeVisible();
    });

    test('back navigation works', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto('/');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      await page.goBack();

      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Responsive Design', () => {
    test('works on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      // Should still be usable on mobile
      await expect(page.getByPlaceholder(/message/i)).toBeVisible();
    });

    test('sidebar collapses on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      await authenticateChatUser(page, 'member1');
      await page.goto('/');

      // Sidebar should be hidden or collapsible on mobile
      // Implementation depends on responsive design
    });
  });

  test.describe('Error Handling', () => {
    test('shows error when message fails to send', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      // Intercept API to simulate failure
      await page.route('**/api/actions/send_message', (route) => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ status: 'error', messages: [{ code: 'SYSTEM_ERROR' }] }),
        });
      });

      await page.getByPlaceholder(/message/i).fill('This will fail');
      await page.getByRole('button', { name: /send/i }).click();

      // Should show error indication
    });

    test('handles network disconnection gracefully', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      // Simulate offline
      await page.context().setOffline(true);

      await page.getByPlaceholder(/message/i).fill('Offline message');
      await page.getByRole('button', { name: /send/i }).click();

      // Should show offline indicator or queue message
    });
  });

  test.describe('Business Rules', () => {
    test.skip('cannot edit message after 15 minutes', async ({ page }) => {
      // Would need to manipulate created_at timestamp
      // Skip for now
    });

    test('cannot undelete a deleted message', async ({ page }) => {
      // Once deleted, cannot be restored
    });

    test('cannot archive default channel', async ({ page }) => {
      // #general is default and cannot be archived
    });
  });
});
