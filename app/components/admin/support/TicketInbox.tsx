'use client';

import { useState, useEffect } from 'react';
import { User, MessageSquare, Clock, AlertCircle, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { SLAIndicator } from './SLAIndicator';

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  createdAt: string;
  firstResponseAt: string | null;
  user: {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  assignedTo: {
    id: string;
    name: string | null;
    username: string | null;
  } | null;
  _count: {
    messages: number;
  };
}

interface TicketInboxProps {
  filters: {
    status: string[];
    priority: string[];
    category: string[];
    assignedTo: string;
    search: string;
  };
  onTicketClick: (ticketId: string) => void;
  refreshTrigger?: number;
  currentUserId?: string;
}

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'emerald', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  pending: { label: 'Pending', color: 'yellow', bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  resolved: { label: 'Resolved', color: 'blue', bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  closed: { label: 'Closed', color: 'gray', bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' },
};

const PRIORITY_COLORS = {
  low: 'text-gray-400',
  medium: 'text-blue-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
};

export function TicketInbox({ filters, onTicketClick, refreshTrigger, currentUserId }: TicketInboxProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchTickets();
  }, [filters, page, refreshTrigger]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      
      // Build query params
      const params = new URLSearchParams();
      
      if (filters.status.length > 0) {
        params.append('status', filters.status.join(','));
      }
      
      if (filters.priority.length > 0) {
        params.append('priority', filters.priority.join(','));
      }
      
      if (filters.category.length > 0) {
        params.append('category', filters.category.join(','));
      }
      
      if (filters.assignedTo) {
        if (filters.assignedTo === 'me' && currentUserId) {
          params.append('assignedTo', currentUserId);
        } else if (filters.assignedTo === 'unassigned') {
          params.append('assignedTo', 'unassigned');
        } else {
          params.append('assignedTo', filters.assignedTo);
        }
      }
      
      if (filters.search) {
        params.append('search', filters.search);
      }
      
      params.append('page', page.toString());
      params.append('limit', '20');
      params.append('sortBy', 'createdAt');
      params.append('sortOrder', 'desc');

      const response = await fetch(`/api/support/tickets?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch tickets');
      }

      const data = await response.json();
      setTickets(data.data || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  if (loading && tickets.length === 0) {
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
        <h3 className="text-xl font-semibold text-white mb-2">No Tickets Found</h3>
        <p className="text-white/60">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Tickets Table */}
      <div className="overflow-x-auto">
        <div className="min-w-full space-y-2">
          {tickets.map((ticket) => {
            const statusConfig = STATUS_CONFIG[ticket.status];
            const isUnassigned = !ticket.assignedTo;
            const isHighPriority = ticket.priority === 'high' || ticket.priority === 'critical';

            return (
              <button
                key={ticket.id}
                onClick={() => onTicketClick(ticket.id)}
                className={`w-full p-4 rounded-xl border transition-all text-left group ${
                  isUnassigned
                    ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/40'
                    : isHighPriority
                    ? 'bg-orange-500/5 border-orange-500/20 hover:border-orange-500/40'
                    : 'bg-white/5 border-white/10 hover:border-emerald-500/30'
                } hover:bg-white/10`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Main Content */}
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* First Row: Ticket # + Status + Priority */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-emerald-400 font-semibold">
                        {ticket.ticketNumber}
                      </span>
                      <div className={`px-2 py-0.5 rounded-md ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border} text-xs font-medium`}>
                        {statusConfig.label}
                      </div>
                      {isHighPriority && (
                        <span className={`px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/20 text-xs font-medium uppercase`}>
                          {ticket.priority}
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 capitalize">
                        {ticket.category}
                      </span>
                    </div>

                    {/* Second Row: Subject */}
                    <h3 className="text-white font-medium group-hover:text-emerald-400 transition-colors truncate">
                      {ticket.subject}
                    </h3>

                    {/* Third Row: User + Assignment + Messages */}
                    <div className="flex items-center gap-4 text-xs text-white/50 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3 h-3" />
                        <span>{ticket.user.name || ticket.user.username || 'User'}</span>
                      </div>
                      
                      {ticket.assignedTo ? (
                        <div className="flex items-center gap-1.5 text-emerald-400">
                          <span>→</span>
                          <span>{ticket.assignedTo.name || ticket.assignedTo.username}</span>
                        </div>
                      ) : (
                        <span className="text-red-400 font-medium">Unassigned</span>
                      )}

                      <div className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        <span>{ticket._count.messages}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                      </div>
                    </div>
                  </div>

                  {/* Right Side: SLA + Arrow */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <SLAIndicator
                      createdAt={ticket.createdAt}
                      firstResponseAt={ticket.firstResponseAt}
                      priority={ticket.priority}
                      status={ticket.status}
                      size="sm"
                    />
                    <ChevronRight className="w-5 h-5 text-white/40 group-hover:text-white transition-colors" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-white/60">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
