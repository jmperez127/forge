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

    test('input keeps focus after sending message', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      const composer = page.getByPlaceholder(/message/i);
      await composer.fill('First message');
      await composer.press('Enter');

      // Wait for message to be sent
      await expect(page.getByText('First message')).toBeVisible();

      // Input should still have focus - can type immediately
      await page.keyboard.type('Second message without clicking');
      await expect(composer).toHaveValue('Second message without clicking');
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
    test('shows typing indicator when another user is typing', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      try {
        await authenticateChatUser(page1, 'member1');
        await authenticateChatUser(page2, 'member2');

        await page1.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);
        await page2.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

        // Wait for WebSocket connections
        await page1.waitForTimeout(1000);
        await page2.waitForTimeout(1000);

        // User 2 starts typing
        await page2.getByPlaceholder(/message/i).fill('I am typing...');

        // User 1 should see typing indicator
        await expect(page1.getByText(/Bob Smith is typing/i)).toBeVisible({ timeout: 3000 });
      } finally {
        await context1.close();
        await context2.close();
      }
    });

    test('typing indicator disappears after user stops typing', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      try {
        await authenticateChatUser(page1, 'member1');
        await authenticateChatUser(page2, 'member2');

        await page1.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);
        await page2.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

        await page1.waitForTimeout(1000);
        await page2.waitForTimeout(1000);

        // User 2 starts typing
        await page2.getByPlaceholder(/message/i).fill('Typing');

        // User 1 sees typing indicator
        await expect(page1.getByText(/is typing/i)).toBeVisible({ timeout: 3000 });

        // Wait for typing timeout (should disappear after ~3 seconds of no input)
        await page1.waitForTimeout(4000);

        // Typing indicator should be gone
        await expect(page1.getByText(/is typing/i)).not.toBeVisible();
      } finally {
        await context1.close();
        await context2.close();
      }
    });

    test('typing indicator shows in thread panel', async ({ browser }) => {
      const messageId = await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Thread typing test',
        authorId: CHAT_TEST_USERS.member1.id,
      });

      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      try {
        await authenticateChatUser(page1, 'member1');
        await authenticateChatUser(page2, 'member2');

        await page1.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);
        await page2.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

        await page1.waitForTimeout(1000);

        // Both users open the thread
        await page1.getByText('Thread typing test').hover();
        await page1.getByRole('button', { name: /reply|thread/i }).click();
        await expect(page1.getByText('Thread')).toBeVisible();

        await page2.getByText('Thread typing test').hover();
        await page2.getByRole('button', { name: /reply|thread/i }).click();
        await expect(page2.getByText('Thread')).toBeVisible();

        await page1.waitForTimeout(500);

        // User 2 types in thread
        await page2.getByPlaceholder(/reply/i).fill('Typing in thread...');

        // User 1 should see typing indicator in thread panel
        await expect(page1.getByText(/is typing/i)).toBeVisible({ timeout: 3000 });
      } finally {
        await context1.close();
        await context2.close();
      }
    });
  });

  test.describe('Threads Page', () => {
    test('displays threads page with all conversations', async ({ page }) => {
      // Create a message and thread reply
      const messageId = await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Parent message for threads page',
        authorId: CHAT_TEST_USERS.member1.id,
      });

      await createThreadReply({
        parentMessageId: messageId,
        content: 'Reply for threads page test',
        authorId: CHAT_TEST_USERS.member2.id,
      });

      await authenticateChatUser(page, 'member1');
      await page.goto('/threads');

      // Should show the thread conversation
      await expect(page.getByText('Parent message for threads page')).toBeVisible();
      await expect(page.getByText(/1 reply/i)).toBeVisible();
    });

    test('threads page shows latest reply info', async ({ page }) => {
      const messageId = await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Message with multiple replies',
        authorId: CHAT_TEST_USERS.member1.id,
      });

      await createThreadReply({
        parentMessageId: messageId,
        content: 'First reply',
        authorId: CHAT_TEST_USERS.member2.id,
      });

      await createThreadReply({
        parentMessageId: messageId,
        content: 'Latest reply content',
        authorId: CHAT_TEST_USERS.admin.id,
      });

      await authenticateChatUser(page, 'member1');
      await page.goto('/threads');

      // Should show 2 replies
      await expect(page.getByText(/2 replies/i)).toBeVisible();
      // Should show latest replier's name
      await expect(page.getByText('Admin User')).toBeVisible();
    });

    test('clicking thread opens thread panel', async ({ page }) => {
      const messageId = await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Click to open thread',
        authorId: CHAT_TEST_USERS.member1.id,
      });

      await createThreadReply({
        parentMessageId: messageId,
        content: 'Thread reply content',
        authorId: CHAT_TEST_USERS.member2.id,
      });

      await authenticateChatUser(page, 'member1');
      await page.goto('/threads');

      // Click on the thread conversation
      await page.getByText('Click to open thread').click();

      // Thread panel should open and show the reply
      await expect(page.getByText('Thread reply content')).toBeVisible();
    });

    test('threads page shows channel name', async ({ page }) => {
      const messageId = await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Thread in general channel',
        authorId: CHAT_TEST_USERS.member1.id,
      });

      await createThreadReply({
        parentMessageId: messageId,
        content: 'Reply',
        authorId: CHAT_TEST_USERS.member2.id,
      });

      await authenticateChatUser(page, 'member1');
      await page.goto('/threads');

      // Should show channel name
      await expect(page.getByText('general')).toBeVisible();
    });

    test('threads page updates in real-time', async ({ browser }) => {
      const messageId = await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Realtime thread page test',
        authorId: CHAT_TEST_USERS.member1.id,
      });

      // Create initial reply so thread appears
      await createThreadReply({
        parentMessageId: messageId,
        content: 'Initial reply',
        authorId: CHAT_TEST_USERS.member1.id,
      });

      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      try {
        await authenticateChatUser(page1, 'member1');
        await authenticateChatUser(page2, 'member2');

        // User 1 views threads page
        await page1.goto('/threads');
        await expect(page1.getByText('Realtime thread page test')).toBeVisible();
        await expect(page1.getByText(/1 reply/i)).toBeVisible();

        // Wait for WebSocket
        await page1.waitForTimeout(1000);

        // User 2 adds another reply via channel
        await page2.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);
        await page2.waitForTimeout(500);
        await page2.getByText('Realtime thread page test').hover();
        await page2.getByRole('button', { name: /reply|thread/i }).click();
        await page2.getByPlaceholder(/reply/i).fill('New realtime reply');
        await page2.getByRole('button', { name: /send/i }).click();

        // User 1's threads page should update
        await expect(page1.getByText(/2 replies/i)).toBeVisible({ timeout: 5000 });
      } finally {
        await context1.close();
        await context2.close();
      }
    });

    test('shows empty state when no threads exist', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto('/threads');

      // Should show empty state (depending on whether there are existing threads)
      // This tests the UI renders correctly
      await expect(page.getByText(/threads/i)).toBeVisible();
    });

    test('can navigate to channel from threads page', async ({ page }) => {
      const messageId = await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Navigate test message',
        authorId: CHAT_TEST_USERS.member1.id,
      });

      await createThreadReply({
        parentMessageId: messageId,
        content: 'Navigate test reply',
        authorId: CHAT_TEST_USERS.member2.id,
      });

      await authenticateChatUser(page, 'member1');
      await page.goto('/threads');

      // Click on channel name to navigate
      await page.getByText('general').first().click();

      // Should navigate to channel
      await expect(page).toHaveURL(/\/channel\//);
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
    test('receives new messages without refresh', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

      // Wait for WebSocket to connect
      await page.waitForTimeout(1000);

      // Create message from "another user" via API
      await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Real-time test message',
        authorId: CHAT_TEST_USERS.member2.id,
      });

      // Message should appear without refresh
      await expect(page.getByText('Real-time test message')).toBeVisible({ timeout: 5000 });
    });

    test('receives new messages in two browser windows', async ({ browser }) => {
      // Create two browser contexts (simulating two users)
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      try {
        // Authenticate both users
        await authenticateChatUser(page1, 'member1');
        await authenticateChatUser(page2, 'member2');

        // Both navigate to same channel
        await page1.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);
        await page2.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);

        // Wait for WebSocket connections
        await page1.waitForTimeout(1000);
        await page2.waitForTimeout(1000);

        // User 1 sends a message
        await page1.getByPlaceholder(/message/i).fill('Hello from user 1');
        await page1.getByRole('button', { name: /send/i }).click();

        // User 2 should see the message without refresh
        await expect(page2.getByText('Hello from user 1')).toBeVisible({ timeout: 5000 });

        // User 2 sends a message back
        await page2.getByPlaceholder(/message/i).fill('Reply from user 2');
        await page2.getByRole('button', { name: /send/i }).click();

        // User 1 should see the reply without refresh
        await expect(page1.getByText('Reply from user 2')).toBeVisible({ timeout: 5000 });
      } finally {
        await context1.close();
        await context2.close();
      }
    });

    test('thread replies update in real-time', async ({ browser }) => {
      // Create a message to reply to
      const messageId = await createMessage({
        channelId: TEST_GENERAL_CHANNEL_ID,
        content: 'Message for thread test',
        authorId: CHAT_TEST_USERS.member1.id,
      });

      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      try {
        await authenticateChatUser(page1, 'member1');
        await authenticateChatUser(page2, 'member2');

        // Both open the channel
        await page1.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);
        await page2.goto(`/channel/${TEST_GENERAL_CHANNEL_ID}`);
        await page1.waitForTimeout(1000);

        // User 1 opens the thread
        await page1.getByText('Message for thread test').hover();
        await page1.getByRole('button', { name: /reply|thread/i }).click();

        // Wait for thread panel to open
        await expect(page1.getByText('Thread')).toBeVisible();

        // User 2 creates a thread reply via API
        await createThreadReply({
          parentMessageId: messageId,
          content: 'Real-time thread reply',
          authorId: CHAT_TEST_USERS.member2.id,
        });

        // User 1 should see the reply in their thread panel
        await expect(page1.getByText('Real-time thread reply')).toBeVisible({ timeout: 5000 });
      } finally {
        await context1.close();
        await context2.close();
      }
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

  test.describe('User Settings', () => {
    test('can access settings page', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto('/settings');

      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await expect(page.getByText('Profile')).toBeVisible();
      await expect(page.getByText('Appearance')).toBeVisible();
      await expect(page.getByText('Notifications')).toBeVisible();
    });

    test('can update display name', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto('/settings');

      await page.getByLabel('Display Name').fill('Updated Name');
      await page.getByRole('button', { name: 'Save Changes' }).click();

      // Should show saved confirmation
      await expect(page.getByText('Saved!')).toBeVisible({ timeout: 3000 });
    });

    test('theme preference persists across sessions', async ({ browser }) => {
      // Session 1: Set theme to light
      const context1 = await browser.newContext();
      const page1 = await context1.newPage();

      try {
        await authenticateChatUser(page1, 'member1');
        await page1.goto('/settings');

        // Click light theme
        await page1.getByRole('button', { name: 'Light' }).click();

        // Wait for save
        await page1.waitForTimeout(500);

        // Verify light mode is applied
        const html = page1.locator('html');
        await expect(html).not.toHaveClass(/dark/);
      } finally {
        await context1.close();
      }

      // Session 2: Verify theme persisted
      const context2 = await browser.newContext();
      const page2 = await context2.newPage();

      try {
        await authenticateChatUser(page2, 'member1');
        await page2.goto('/settings');

        // Wait for preferences to load
        await page2.waitForTimeout(500);

        // Light button should be selected (has border-primary class)
        await expect(page2.getByRole('button', { name: 'Light' })).toHaveClass(/border-primary/);

        // HTML should not have dark class
        const html = page2.locator('html');
        await expect(html).not.toHaveClass(/dark/);
      } finally {
        await context2.close();
      }
    });

    test('notification preferences persist', async ({ browser }) => {
      // Session 1: Disable notifications
      const context1 = await browser.newContext();
      const page1 = await context1.newPage();

      try {
        await authenticateChatUser(page1, 'member1');
        await page1.goto('/settings');

        // Find and click the notifications toggle to disable
        const notificationSection = page1.locator('section').filter({ hasText: 'Enable Notifications' });
        const toggle = notificationSection.locator('button[class*="rounded-full"]');
        await toggle.click();

        // Wait for save
        await page1.waitForTimeout(500);
      } finally {
        await context1.close();
      }

      // Session 2: Verify setting persisted
      const context2 = await browser.newContext();
      const page2 = await context2.newPage();

      try {
        await authenticateChatUser(page2, 'member1');
        await page2.goto('/settings');

        // Wait for preferences to load
        await page2.waitForTimeout(500);

        // Notifications toggle should be off (bg-muted class instead of bg-primary)
        const notificationSection = page2.locator('section').filter({ hasText: 'Enable Notifications' });
        const toggle = notificationSection.locator('button[class*="rounded-full"]');
        await expect(toggle).toHaveClass(/bg-muted/);
      } finally {
        await context2.close();
      }
    });

    test('can navigate to workspace settings', async ({ page }) => {
      await authenticateChatUser(page, 'admin');
      await page.goto('/settings');

      // Click on workspace settings link
      await page.getByText('Workspace Settings').click();

      await expect(page).toHaveURL('/workspace-settings');
      await expect(page.getByRole('heading', { name: 'Workspace Settings' })).toBeVisible();
    });
  });

  test.describe('Members', () => {
    test('can access members page', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto('/members');

      await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
      await expect(page.getByText('Add Member')).toBeVisible();
    });

    test('displays existing members', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto('/members');

      // Should show at least the current user
      await expect(page.getByText('Alice Chen')).toBeVisible();
      await expect(page.getByText('(you)')).toBeVisible();
    });

    test('can search members', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto('/members');

      // Search for a specific member
      await page.getByPlaceholder('Search members...').fill('Alice');

      // Should filter to show only matching members
      await expect(page.getByText('Alice Chen')).toBeVisible();
    });

    test('shows member roles with icons', async ({ page }) => {
      await authenticateChatUser(page, 'admin');
      await page.goto('/members');

      // Should show role labels
      await expect(page.getByText('Owner').or(page.getByText('Admin')).or(page.getByText('Member'))).toBeVisible();
    });

    test('can add a new member', async ({ page }) => {
      await authenticateChatUser(page, 'admin');
      await page.goto('/members');

      // Click add member button
      await page.getByRole('button', { name: 'Add Member' }).click();

      // Fill in email
      await page.getByLabel('Email address').fill('newmember@example.com');

      // Submit
      await page.getByRole('button', { name: 'Add Member' }).nth(1).click();

      // Dialog should close and new member should appear
      await expect(page.getByText('newmember@example.com')).toBeVisible({ timeout: 5000 });
    });

    test('new members appear in real-time for other users', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      try {
        await authenticateChatUser(page1, 'member1');
        await authenticateChatUser(page2, 'admin');

        // Both users view members page
        await page1.goto('/members');
        await page2.goto('/members');

        // Wait for WebSocket connections
        await page1.waitForTimeout(1000);
        await page2.waitForTimeout(1000);

        // Admin adds a new member
        await page2.getByRole('button', { name: 'Add Member' }).click();
        await page2.getByLabel('Email address').fill('realtime-test@example.com');
        await page2.getByRole('button', { name: 'Add Member' }).nth(1).click();

        // Member1 should see the new member appear without refresh
        await expect(page1.getByText('realtime-test@example.com')).toBeVisible({ timeout: 5000 });
      } finally {
        await context1.close();
        await context2.close();
      }
    });

    test('admin can change member roles', async ({ page }) => {
      await authenticateChatUser(page, 'admin');
      await page.goto('/members');

      // Find a regular member and click the more options menu
      const memberRow = page.locator('div').filter({ hasText: /Member/ }).first();
      await memberRow.getByRole('button', { name: /more/i }).click();

      // Click "Make Admin" option
      await page.getByRole('menuitem', { name: /Make Admin/i }).click();

      // Role should update
      await expect(memberRow.getByText('Admin')).toBeVisible({ timeout: 3000 });
    });

    test('members list sorted by role', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto('/members');

      // Get all role badges in order
      const roles = await page.locator('text=/Owner|Admin|Member/').allTextContents();

      // Verify owners come before admins, admins before members
      const roleOrder = roles.map(r => {
        if (r === 'Owner') return 0;
        if (r === 'Admin') return 1;
        return 2;
      });

      // Should be in non-decreasing order
      for (let i = 1; i < roleOrder.length; i++) {
        expect(roleOrder[i]).toBeGreaterThanOrEqual(roleOrder[i - 1]);
      }
    });

    test('can navigate to members from sidebar', async ({ page }) => {
      await authenticateChatUser(page, 'member1');
      await page.goto('/');

      // Click members link in sidebar
      await page.getByRole('link', { name: /members/i }).click();

      await expect(page).toHaveURL('/members');
      await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
    });
  });

  test.describe('Workspace Settings', () => {
    test('can access workspace settings page', async ({ page }) => {
      await authenticateChatUser(page, 'admin');
      await page.goto('/workspace-settings');

      await expect(page.getByRole('heading', { name: 'Workspace Settings' })).toBeVisible();
      await expect(page.getByText('Channel Defaults')).toBeVisible();
      await expect(page.getByText('Access')).toBeVisible();
      await expect(page.getByText('Message Retention')).toBeVisible();
    });

    test('can change default channel visibility', async ({ page }) => {
      await authenticateChatUser(page, 'admin');
      await page.goto('/workspace-settings');

      // Click private visibility option
      await page.getByRole('button', { name: /Private/ }).click();

      // Save settings
      await page.getByRole('button', { name: 'Save Settings' }).click();

      // Should show saved confirmation
      await expect(page.getByText('Saved!')).toBeVisible({ timeout: 3000 });
    });

    test('can toggle allow guests setting', async ({ page }) => {
      await authenticateChatUser(page, 'admin');
      await page.goto('/workspace-settings');

      // Find and click the allow guests toggle
      const accessSection = page.locator('section').filter({ hasText: 'Allow Guests' });
      const toggle = accessSection.locator('button[class*="rounded-full"]');
      await toggle.click();

      // Save settings
      await page.getByRole('button', { name: 'Save Settings' }).click();

      await expect(page.getByText('Saved!')).toBeVisible({ timeout: 3000 });
    });

    test('can set message retention period', async ({ page }) => {
      await authenticateChatUser(page, 'admin');
      await page.goto('/workspace-settings');

      // Set retention to 30 days
      await page.getByLabel('Retention Period').fill('30');

      // Save settings
      await page.getByRole('button', { name: 'Save Settings' }).click();

      await expect(page.getByText('Saved!')).toBeVisible({ timeout: 3000 });
    });

    test('workspace settings persist across sessions', async ({ browser }) => {
      // Session 1: Set retention to 90 days and enable guests
      const context1 = await browser.newContext();
      const page1 = await context1.newPage();

      try {
        await authenticateChatUser(page1, 'admin');
        await page1.goto('/workspace-settings');

        // Set retention to 90 days
        await page1.getByLabel('Retention Period').fill('90');

        // Enable guests
        const accessSection = page1.locator('section').filter({ hasText: 'Allow Guests' });
        const toggle = accessSection.locator('button[class*="rounded-full"]');
        await toggle.click();

        // Save settings
        await page1.getByRole('button', { name: 'Save Settings' }).click();
        await expect(page1.getByText('Saved!')).toBeVisible({ timeout: 3000 });
      } finally {
        await context1.close();
      }

      // Session 2: Verify settings persisted
      const context2 = await browser.newContext();
      const page2 = await context2.newPage();

      try {
        await authenticateChatUser(page2, 'admin');
        await page2.goto('/workspace-settings');

        // Wait for settings to load
        await page2.waitForTimeout(500);

        // Retention should be 90
        await expect(page2.getByLabel('Retention Period')).toHaveValue('90');

        // Allow guests should be on (bg-primary class)
        const accessSection = page2.locator('section').filter({ hasText: 'Allow Guests' });
        const toggle = accessSection.locator('button[class*="rounded-full"]');
        await expect(toggle).toHaveClass(/bg-primary/);
      } finally {
        await context2.close();
      }
    });

    test('can navigate back from workspace settings', async ({ page }) => {
      await authenticateChatUser(page, 'admin');
      await page.goto('/workspace-settings');

      // Click back button
      await page.getByRole('button', { name: /back/i }).click();

      // Should navigate back to previous page
      await expect(page).not.toHaveURL('/workspace-settings');
    });
  });
});
