'use client';

import { useState, useEffect } from 'react';
import { Clock, MessageSquare, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  createdAt: string;
  _count: {
    messages: number;
  };
}

interface TicketListProps {
  onTicketClick: (ticketId: string) => void;
  refreshTrigger?: number;
}

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'emerald', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  pending: { label: 'Pending', color: 'yellow', bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  resolved: { label: 'Resolved', color: 'blue', bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  closed: { label: 'Closed', color: 'gray', bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' },
};

const PRIORITY_CONFIG = {
  low: { label: 'Low', color: 'gray' },
  medium: { label: 'Medium', color: 'blue' },
  high: { label: 'High', color: 'orange' },
  critical: { label: 'Critical', color: 'red' },
};

export function TicketList({ onTicketClick, refreshTrigger }: TicketListProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTickets();
  }, [refreshTrigger]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/support/tickets?sortBy=createdAt&sortOrder=desc', {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch tickets');
      }

      const data = await response.json();
      setTickets(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="text-center py-12 px-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 mb-4">
          <MessageSquare className="w-8 h-8 text-emerald-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">No Support Tickets</h3>
        <p className="text-white/60">You haven't created any support tickets yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tickets.map((ticket) => {
        const statusConfig = STATUS_CONFIG[ticket.status];
        const priorityConfig = PRIORITY_CONFIG[ticket.priority];

        return (
          <button
            key={ticket.id}
            onClick={() => onTicketClick(ticket.id)}
            className="w-full p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-emerald-500/30 transition-all text-left group"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              {/* Ticket Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-emerald-400">
                    {ticket.ticketNumber}
                  </span>
                  {ticket.priority !== 'low' && ticket.priority !== 'medium' && (
                    <span className={`text-xs px-2 py-0.5 rounded-md bg-${priorityConfig.color}-500/10 text-${priorityConfig.color}-400 border border-${priorityConfig.color}-500/20`}>
                      {priorityConfig.label}
                    </span>
                  )}
                </div>
                <h3 className="text-white font-medium mb-1 group-hover:text-emerald-400 transition-colors truncate">
                  {ticket.subject}
                </h3>
                <div className="flex items-center gap-3 text-xs text-white/50">
                  <span className="capitalize">{ticket.category.replace('_', ' ')}</span>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className={`px-3 py-1.5 rounded-lg ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border} text-xs font-medium whitespace-nowrap`}>
                {statusConfig.label}
              </div>
            </div>

            {/* Message Count */}
            <div className="flex items-center gap-2 text-xs text-white/50">
              <MessageSquare className="w-4 h-4" />
              <span>{ticket._count.messages} {ticket._count.messages === 1 ? 'message' : 'messages'}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
