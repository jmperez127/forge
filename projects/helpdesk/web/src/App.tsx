import { ForgeProvider } from '@forge/react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { TicketList } from './pages/TicketList';
import { TicketDetail } from './pages/TicketDetail';
import { NewTicket } from './pages/NewTicket';

const forgeConfig = {
  url: import.meta.env.VITE_API_URL || 'http://localhost:8080',
  token: import.meta.env.VITE_API_TOKEN,
};

export default function App() {
  return (
    <ForgeProvider config={forgeConfig}>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-100">
          <nav className="bg-white shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16">
                <div className="flex">
                  <Link to="/" className="flex-shrink-0 flex items-center">
                    <span className="text-xl font-bold text-indigo-600">Helpdesk</span>
                  </Link>
                  <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                    <Link
                      to="/"
                      className="border-indigo-500 text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                    >
                      Tickets
                    </Link>
                    <Link
                      to="/new"
                      className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                    >
                      New Ticket
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </nav>

          <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <Routes>
              <Route path="/" element={<TicketList />} />
              <Route path="/tickets/:id" element={<TicketDetail />} />
              <Route path="/new" element={<NewTicket />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </ForgeProvider>
  );
}
