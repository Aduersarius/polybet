'use client';

import { useState } from 'react';
import { Plus, Headphones, MessageSquareText } from 'lucide-react';
import { CreateTicketModal } from '@/app/components/support/CreateTicketModal';
import { TicketList } from '@/app/components/support/TicketList';
import { TicketDetail } from '@/app/components/support/TicketDetail';
import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';

export default function SupportPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Redirect to login if not authenticated
  if (!isPending && !session) {
    router.push('/');
    return null;
  }

  const handleCreateSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleTicketClick = (ticketId: string) => {
    setSelectedTicketId(ticketId);
  };

  const handleCloseDetail = () => {
    setSelectedTicketId(null);
    setRefreshTrigger((prev) => prev + 1); // Refresh list after closing detail
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-3 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-white">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/20 via-black to-blue-950/20" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/20">
              <Headphones className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Support Center</h1>
              <p className="text-white/60">Get help from our support team</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Create Ticket Card */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="p-6 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 hover:border-emerald-500/40 transition-all group text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-emerald-500/20 group-hover:bg-emerald-500/30 transition-colors">
                <Plus className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold group-hover:text-emerald-400 transition-colors">
                New Ticket
              </h3>
            </div>
            <p className="text-sm text-white/60">Create a new support ticket</p>
          </button>

          {/* FAQ Card */}
          <a
            href="/faq"
            className="p-6 rounded-xl bg-white/5 border border-white/10 hover:border-blue-500/40 transition-all group text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-blue-500/20 group-hover:bg-blue-500/30 transition-colors">
                <MessageSquareText className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold group-hover:text-blue-400 transition-colors">
                FAQ
              </h3>
            </div>
            <p className="text-sm text-white/60">Find quick answers</p>
          </a>

          {/* Response Time Card */}
          <div className="p-6 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Headphones className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold">
                Avg Response
              </h3>
            </div>
            <p className="text-2xl font-bold text-purple-400">~2 hours</p>
          </div>
        </div>

        {/* Tickets Section */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Your Tickets</h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-medium transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Ticket
            </button>
          </div>

          <TicketList 
            onTicketClick={handleTicketClick} 
            refreshTrigger={refreshTrigger}
          />
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateTicketModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {selectedTicketId && (
        <TicketDetail
          ticketId={selectedTicketId}
          onClose={handleCloseDetail}
        />
      )}
    </div>
  );
}

