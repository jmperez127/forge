import {
  CHAT_TEST_USERS,
  CHAT_API_URL,
  TEST_WORKSPACE_ID,
  TEST_GENERAL_CHANNEL_ID,
  TEST_PRIVATE_CHANNEL_ID,
} from './chat-auth.js';

/**
 * Chat database test utilities using HTTP API.
 */

// In-memory tracking of created test data for cleanup
let createdMessages: string[] = [];
let createdChannels: string[] = [];
let createdDMs: string[] = [];
let seedDataCreated = false;

/**
 * Make an API request (admin auth for test setup).
 */
async function chatApiRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = Buffer.from(
    JSON.stringify({
      sub: CHAT_TEST_USERS.owner.id,
      email: CHAT_TEST_USERS.owner.email,
      role: 'owner',
      workspace_id: TEST_WORKSPACE_ID,
      exp: Date.now() + 3600000,
    })
  ).toString('base64');

  const response = await fetch(`${CHAT_API_URL}${path}`, {
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
 * Ensure seed data exists (workspace, users, channels).
 */
async function ensureChatSeedData(): Promise<void> {
  if (seedDataCreated) return;

  try {
    // Create test users
    for (const user of Object.values(CHAT_TEST_USERS)) {
      try {
        await chatApiRequest('POST', '/api/entities/User', {
          id: user.id,
          email: user.email,
          display_name: user.name,
          password_hash: 'test_hash',
        });
      } catch (e) {
        // User may already exist
      }
    }

    // Create test workspace
    try {
      await chatApiRequest('POST', '/api/entities/Workspace', {
        id: TEST_WORKSPACE_ID,
        name: 'Acme Inc',
        slug: 'acme',
        owner_id: CHAT_TEST_USERS.owner.id,
      });
    } catch (e) {
      // Workspace may already exist
    }

    // Create workspace members (except outsider)
    for (const user of [
      CHAT_TEST_USERS.owner,
      CHAT_TEST_USERS.admin,
      CHAT_TEST_USERS.member1,
      CHAT_TEST_USERS.member2,
    ]) {
      try {
        await chatApiRequest('POST', '/api/entities/WorkspaceMember', {
          workspace_id: TEST_WORKSPACE_ID,
          user_id: user.id,
          role: user.role === 'owner' ? 'owner' : user.role === 'admin' ? 'admin' : 'member',
        });
      } catch (e) {
        // Member may already exist
      }
    }

    // Create #general channel (default, public)
    try {
      await chatApiRequest('POST', '/api/entities/Channel', {
        id: TEST_GENERAL_CHANNEL_ID,
        workspace_id: TEST_WORKSPACE_ID,
        name: 'general',
        slug: 'general',
        visibility: 'public',
        is_default: true,
        creator_id: CHAT_TEST_USERS.owner.id,
      });
    } catch (e) {
      // Channel may already exist
    }

    // Create private channel
    try {
      await chatApiRequest('POST', '/api/entities/Channel', {
        id: TEST_PRIVATE_CHANNEL_ID,
        workspace_id: TEST_WORKSPACE_ID,
        name: 'secret-project',
        slug: 'secret-project',
        visibility: 'private',
        is_default: false,
        creator_id: CHAT_TEST_USERS.admin.id,
      });
    } catch (e) {
      // Channel may already exist
    }

    // Add members to #general
    for (const user of [
      CHAT_TEST_USERS.owner,
      CHAT_TEST_USERS.admin,
      CHAT_TEST_USERS.member1,
      CHAT_TEST_USERS.member2,
    ]) {
      try {
        await chatApiRequest('POST', '/api/entities/ChannelMember', {
          channel_id: TEST_GENERAL_CHANNEL_ID,
          user_id: user.id,
          role: user.id === CHAT_TEST_USERS.owner.id ? 'admin' : 'member',
        });
      } catch (e) {
        // Member may already exist
      }
    }

    // Add only admin and member1 to private channel
    for (const user of [CHAT_TEST_USERS.admin, CHAT_TEST_USERS.member1]) {
      try {
        await chatApiRequest('POST', '/api/entities/ChannelMember', {
          channel_id: TEST_PRIVATE_CHANNEL_ID,
          user_id: user.id,
          role: user.id === CHAT_TEST_USERS.admin.id ? 'admin' : 'member',
        });
      } catch (e) {
        // Member may already exist
      }
    }

    seedDataCreated = true;
  } catch (error) {
    console.error('Failed to create chat seed data:', error);
  }
}

/**
 * Create a test message via API.
 */
export async function createMessage(options: {
  channelId?: string;
  dmId?: string;
  content: string;
  authorId?: string;
}): Promise<string> {
  await ensureChatSeedData();

  const {
    channelId,
    dmId,
    content,
    authorId = CHAT_TEST_USERS.member1.id,
  } = options;

  try {
    const result = await chatApiRequest<{ id: string }>('POST', '/api/entities/Message', {
      channel_id: channelId,
      dm_id: dmId,
      content,
      author_id: authorId,
    });

    if (result && result.id) {
      createdMessages.push(result.id);
      return result.id;
    }
    console.error('No ID returned from create message:', result);
    return 'fake-message-id';
  } catch (error) {
    console.error('Failed to create message:', error);
    return 'fake-message-id';
  }
}

/**
 * Create a test channel via API.
 */
export async function createChannel(options: {
  name: string;
  visibility?: 'public' | 'private';
  creatorId?: string;
}): Promise<string> {
  await ensureChatSeedData();

  const {
    name,
    visibility = 'public',
    creatorId = CHAT_TEST_USERS.admin.id,
  } = options;

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  try {
    const result = await chatApiRequest<{ id: string }>('POST', '/api/entities/Channel', {
      workspace_id: TEST_WORKSPACE_ID,
      name,
      slug,
      visibility,
      is_default: false,
      creator_id: creatorId,
    });

    if (result && result.id) {
      createdChannels.push(result.id);
      return result.id;
    }
    console.error('No ID returned from create channel:', result);
    return 'fake-channel-id';
  } catch (error) {
    console.error('Failed to create channel:', error);
    return 'fake-channel-id';
  }
}

/**
 * Create a direct message conversation via API.
 */
export async function createDM(options: {
  participantIds: string[];
}): Promise<string> {
  await ensureChatSeedData();

  try {
    const result = await chatApiRequest<{ id: string }>('POST', '/api/entities/DirectMessage', {
      workspace_id: TEST_WORKSPACE_ID,
    });

    if (result && result.id) {
      // Add participants
      for (const participantId of options.participantIds) {
        await chatApiRequest('POST', '/api/entities/DirectMessageParticipant', {
          dm_id: result.id,
          user_id: participantId,
        });
      }
      createdDMs.push(result.id);
      return result.id;
    }
    console.error('No ID returned from create DM:', result);
    return 'fake-dm-id';
  } catch (error) {
    console.error('Failed to create DM:', error);
    return 'fake-dm-id';
  }
}

/**
 * Create a reaction via API.
 */
export async function addReaction(options: {
  messageId: string;
  emoji: string;
  userId?: string;
}): Promise<string> {
  const { messageId, emoji, userId = CHAT_TEST_USERS.member1.id } = options;

  try {
    const result = await chatApiRequest<{ id: string }>('POST', '/api/entities/Reaction', {
      message_id: messageId,
      emoji,
      user_id: userId,
    });

    return result?.id || 'fake-reaction-id';
  } catch (error) {
    console.error('Failed to add reaction:', error);
    return 'fake-reaction-id';
  }
}

/**
 * Create a thread reply via API.
 */
export async function createThreadReply(options: {
  parentMessageId: string;
  content: string;
  authorId?: string;
}): Promise<string> {
  const {
    parentMessageId,
    content,
    authorId = CHAT_TEST_USERS.member2.id,
  } = options;

  try {
    const result = await chatApiRequest<{ id: string }>('POST', '/api/entities/Thread', {
      parent_id: parentMessageId,
      content,
      author_id: authorId,
    });

    return result?.id || 'fake-thread-id';
  } catch (error) {
    console.error('Failed to create thread reply:', error);
    return 'fake-thread-id';
  }
}

/**
 * Get a message by ID via API.
 */
export async function getMessage(id: string): Promise<Record<string, unknown> | null> {
  try {
    return await chatApiRequest<Record<string, unknown>>('GET', `/api/entities/Message/${id}`);
  } catch (error) {
    return null;
  }
}

/**
 * Update a message via API.
 */
export async function updateMessage(
  id: string,
  content: string
): Promise<void> {
  try {
    await chatApiRequest('PUT', `/api/entities/Message/${id}`, {
      content,
      edited: true,
    });
  } catch (error) {
    console.error('Failed to update message:', error);
  }
}

/**
 * Delete a message (soft delete) via API.
 */
export async function deleteMessage(id: string): Promise<void> {
  try {
    await chatApiRequest('PUT', `/api/entities/Message/${id}`, {
      deleted: true,
    });
  } catch (error) {
    console.error('Failed to delete message:', error);
  }
}

/**
 * Clean all test messages via API.
 */
export async function cleanChatData(): Promise<void> {
  // Delete messages first
  for (const id of [...createdMessages]) {
    try {
      await chatApiRequest('DELETE', `/api/entities/Message/${id}`);
    } catch (error) {
      // Ignore
    }
  }
  createdMessages = [];

  // Delete DMs
  for (const id of [...createdDMs]) {
    try {
      await chatApiRequest('DELETE', `/api/entities/DirectMessage/${id}`);
    } catch (error) {
      // Ignore
    }
  }
  createdDMs = [];

  // Delete channels (except seed channels)
  for (const id of [...createdChannels]) {
    try {
      await chatApiRequest('DELETE', `/api/entities/Channel/${id}`);
    } catch (error) {
      // Ignore
    }
  }
  createdChannels = [];
}

// Re-export test constants
export {
  TEST_WORKSPACE_ID,
  TEST_GENERAL_CHANNEL_ID,
  TEST_PRIVATE_CHANNEL_ID,
} from './chat-auth.js';
