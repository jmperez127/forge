import { useList } from '@forge/react';
import { Link } from 'react-router-dom';

interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  author: { name: string };
  assignee?: { name: string };
  created_at: string;
}

const statusColors = {
  open: 'bg-blue-100 text-blue-800',
  pending: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-purple-100 text-purple-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800',
};

const priorityColors = {
  low: 'text-gray-500',
  medium: 'text-blue-500',
  high: 'text-orange-500',
  urgent: 'text-red-500',
};

export function TicketList() {
  const { data: tickets, loading, error } = useList<Ticket>('TicketList');

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 p-4 rounded-md">
        <p className="text-red-800">Error loading tickets</p>
      </div>
    );
  }

  if (!tickets || tickets.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6 text-center">
        <p className="text-gray-500">No tickets found</p>
        <Link
          to="/new"
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          Create your first ticket
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      <ul className="divide-y divide-gray-200">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <Link to={`/tickets/${ticket.id}`} className="block hover:bg-gray-50">
              <div className="px-4 py-4 sm:px-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center min-w-0">
                    <span className={`${priorityColors[ticket.priority]} mr-2`}>
                      {ticket.priority === 'urgent' && '!!! '}
                      {ticket.priority === 'high' && '!! '}
                      {ticket.priority === 'medium' && '! '}
                    </span>
                    <p className="text-sm font-medium text-indigo-600 truncate">
                      {ticket.subject}
                    </p>
                  </div>
                  <div className="ml-2 flex-shrink-0 flex">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        statusColors[ticket.status]
                      }`}
                    >
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <div className="mt-2 sm:flex sm:justify-between">
                  <div className="sm:flex">
                    <p className="flex items-center text-sm text-gray-500">
                      By {ticket.author?.name || 'Unknown'}
                    </p>
                    {ticket.assignee && (
                      <p className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0 sm:ml-6">
                        Assigned to {ticket.assignee.name}
                      </p>
                    )}
                  </div>
                  <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                    <time dateTime={ticket.created_at}>
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </time>
                  </div>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
