import { useParams } from 'react-router-dom';
import { useEntity, useList, useAction } from '@forge/react';
import { useState } from 'react';

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: 'open' | 'pending' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  author: { id: string; name: string; email: string };
  assignee?: { id: string; name: string; email: string };
  tags: { id: string; name: string; color: string }[];
  created_at: string;
  updated_at: string;
}

interface Comment {
  id: string;
  body: string;
  internal: boolean;
  author: { name: string };
  created_at: string;
}

const statusColors = {
  open: 'bg-blue-100 text-blue-800',
  pending: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-purple-100 text-purple-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800',
};

export function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: ticket, loading, error } = useEntity<Ticket>('Ticket', id!);
  const { data: comments } = useList<Comment>('CommentThread');
  const closeTicket = useAction<{ ticket: string }>('close_ticket');
  const addComment = useAction<{ ticket: string; body: string; internal: boolean }>('add_comment');

  const [commentBody, setCommentBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="bg-red-50 p-4 rounded-md">
        <p className="text-red-800">Error loading ticket</p>
      </div>
    );
  }

  const handleClose = async () => {
    if (confirm('Are you sure you want to close this ticket?')) {
      try {
        await closeTicket.execute({ ticket: ticket.id });
      } catch (e) {
        // Error is handled by the hook
      }
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;

    try {
      await addComment.execute({
        ticket: ticket.id,
        body: commentBody,
        internal: isInternal,
      });
      setCommentBody('');
      setIsInternal(false);
    } catch (e) {
      // Error is handled by the hook
    }
  };

  return (
    <div className="space-y-6">
      {/* Ticket Header */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-start">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              {ticket.subject}
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Created by {ticket.author?.name} on{' '}
              {new Date(ticket.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span
              className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${
                statusColors[ticket.status]
              }`}
            >
              {ticket.status.replace('_', ' ')}
            </span>
            {ticket.status !== 'closed' && (
              <button
                onClick={handleClose}
                disabled={closeTicket.loading}
                className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                {closeTicket.loading ? 'Closing...' : 'Close Ticket'}
              </button>
            )}
          </div>
        </div>
        <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500">Description</dt>
              <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                {ticket.description}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Priority</dt>
              <dd className="mt-1 text-sm text-gray-900 capitalize">{ticket.priority}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Assignee</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {ticket.assignee?.name || 'Unassigned'}
              </dd>
            </div>
            {ticket.tags && ticket.tags.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">Tags</dt>
                <dd className="mt-1 flex flex-wrap gap-2">
                  {ticket.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: tag.color, color: '#fff' }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Comments */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Comments</h3>
        </div>
        <div className="border-t border-gray-200">
          {comments && comments.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {comments.map((comment) => (
                <li key={comment.id} className="px-4 py-4 sm:px-6">
                  <div className="flex space-x-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-gray-900">
                          {comment.author?.name}
                          {comment.internal && (
                            <span className="ml-2 text-xs text-yellow-600">(Internal)</span>
                          )}
                        </h4>
                        <p className="text-sm text-gray-500">
                          {new Date(comment.created_at).toLocaleString()}
                        </p>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.body}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-4 sm:px-6 text-sm text-gray-500">No comments yet</p>
          )}
        </div>

        {/* Add Comment Form */}
        {ticket.status !== 'closed' && (
          <div className="border-t border-gray-200 px-4 py-4 sm:px-6">
            <form onSubmit={handleAddComment} className="space-y-4">
              <div>
                <label htmlFor="comment" className="sr-only">
                  Add a comment
                </label>
                <textarea
                  id="comment"
                  name="comment"
                  rows={3}
                  className="shadow-sm block w-full focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border border-gray-300 rounded-md"
                  placeholder="Add a comment..."
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                  />
                  <span className="ml-2 text-sm text-gray-500">Internal note</span>
                </label>
                <button
                  type="submit"
                  disabled={addComment.loading || !commentBody.trim()}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {addComment.loading ? 'Posting...' : 'Post Comment'}
                </button>
              </div>
              {addComment.error && (
                <p className="text-sm text-red-600">
                  {addComment.error.messages[0]?.message || 'Failed to post comment'}
                </p>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
