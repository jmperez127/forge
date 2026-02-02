import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAction } from '@forge/react';

interface CreateTicketInput {
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export function NewTicket() {
  const navigate = useNavigate();
  const createTicket = useAction<CreateTicketInput>('create_ticket');

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<CreateTicketInput['priority']>('medium');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createTicket.execute({
        subject,
        description,
        priority,
      });
      navigate('/');
    } catch (e) {
      // Error is handled by the hook
    }
  };

  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900">Create New Ticket</h3>
        <p className="mt-1 text-sm text-gray-500">
          Submit a new support ticket and our team will get back to you.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700">
              Subject
            </label>
            <div className="mt-1">
              <input
                type="text"
                name="subject"
                id="subject"
                required
                maxLength={120}
                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="Brief summary of your issue"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">{subject.length}/120 characters</p>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <div className="mt-1">
              <textarea
                id="description"
                name="description"
                rows={6}
                required
                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md"
                placeholder="Describe your issue in detail..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="priority" className="block text-sm font-medium text-gray-700">
              Priority
            </label>
            <div className="mt-1">
              <select
                id="priority"
                name="priority"
                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                value={priority}
                onChange={(e) => setPriority(e.target.value as CreateTicketInput['priority'])}
              >
                <option value="low">Low - General questions</option>
                <option value="medium">Medium - Standard issues</option>
                <option value="high">High - Blocking issues</option>
                <option value="urgent">Urgent - Critical problems</option>
              </select>
            </div>
          </div>

          {createTicket.error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Error creating ticket</h3>
                  <div className="mt-2 text-sm text-red-700">
                    {createTicket.error.messages.map((msg, i) => (
                      <p key={i}>{msg.message || msg.code}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTicket.loading || !subject.trim() || !description.trim()}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {createTicket.loading ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
