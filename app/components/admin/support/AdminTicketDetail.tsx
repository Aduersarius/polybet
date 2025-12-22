'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, ArrowLeft, Clock, User, AlertTriangle, CheckCircle, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { InternalNotes } from './InternalNotes';
import { SLAIndicator } from './SLAIndicator';

interface Message {
  id: string;
  content: string;
  createdAt: string;
  source: 'web' | 'telegram' | 'agent';
  isInternal: boolean;
  user: {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  attachments: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    url: string;
  }>;
}

interface TicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  source: string;
  createdAt: string;
  firstResponseAt: string | null;
  user: {
    id: string;
    name: string | null;
    username: string | null;
    email: string | null;
  };
  assignedTo: {
    id: string;
    name: string | null;
    username: string | null;
  } | null;
  messages: Message[];
}

interface AdminTicketDetailProps {
  ticketId: string;
  onClose: () => void;
  agents: Array<{ id: string; name: string | null; username: string | null }>;
  currentUserId: string;
}

const STATUS_OPTIONS = ['open', 'pending', 'resolved', 'closed'];
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical'];

export function AdminTicketDetail({ ticketId, onClose, agents, currentUserId }: AdminTicketDetailProps) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTicket();
  }, [ticketId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages]);

  const fetchTicket = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/support/tickets/${ticketId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch ticket');
      }

      const data = await response.json();
      setTicket(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim()) return;

    setSending(true);
    setError('');

    try {
      const response = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send message');
      }

      setNewMessage('');
      await fetchTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleAssign = async (agentId: string) => {
    setUpdating(true);
    try {
      const response = await fetch(`/api/support/tickets/${ticketId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });

      if (!response.ok) {
        throw new Error('Failed to assign ticket');
      }

      await fetchTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign ticket');
    } finally {
      setUpdating(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    setUpdating(true);
    try {
      const response = await fetch(`/api/support/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      await fetchTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const handlePriorityChange = async (priority: string) => {
    setUpdating(true);
    try {
      const response = await fetch(`/api/support/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority }),
      });

      if (!response.ok) {
        throw new Error('Failed to update priority');
      }

      await fetchTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update priority');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
        <div className="animate-spin rounded-full h-12 w-12 border-3 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!ticket) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4 overflow-y-auto py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-6xl bg-gradient-to-br from-[#1a1f2e]/95 via-[#1a1d2e]/90 to-[#16181f]/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        >
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-purple-500/5 pointer-events-none" />

          {/* Header */}
          <div className="relative px-6 py-4 border-b border-white/10">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
                >
                  <ArrowLeft className="w-5 h-5 text-white/60 hover:text-white transition-colors" />
                </button>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-mono text-emerald-400">{ticket.ticketNumber}</span>
                    <SLAIndicator
                      createdAt={ticket.createdAt}
                      firstResponseAt={ticket.firstResponseAt}
                      priority={ticket.priority}
                      status={ticket.status}
                    />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">{ticket.subject}</h2>
                  <div className="flex items-center gap-3 text-xs text-white/50">
                    <span>User: {ticket.user.name || ticket.user.username || ticket.user.email}</span>
                    <span>•</span>
                    <span>Source: {ticket.source}</span>
                    <span>•</span>
                    <span>{formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
              >
                <X className="w-5 h-5 text-white/60 hover:text-white transition-colors" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 max-h-[80vh] overflow-y-auto">
            {/* Left Column: Messages (2/3 width) */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-400" />
                Messages ({ticket.messages.length})
              </h3>

              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {ticket.messages.map((message) => {
                  const isAgent = message.source === 'agent';
                  
                  return (
                    <div key={message.id} className="flex gap-3">
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isAgent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        <User className="w-4 h-4" />
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-white">
                            {message.user.name || message.user.username || 'User'}
                          </span>
                          {isAgent && (
                            <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              Support
                            </span>
                          )}
                          {message.isInternal && (
                            <span className="text-xs px-2 py-0.5 rounded-md bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                              Internal
                            </span>
                          )}
                          <span className="text-xs text-white/40 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <div className={`p-3 rounded-xl ${message.isInternal ? 'bg-yellow-500/10 border border-yellow-500/20' : isAgent ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-white/5 border border-white/10'}`}>
                          <p className="text-white/90 text-sm whitespace-pre-wrap break-words">{message.content}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <form onSubmit={handleSendMessage} className="pt-4 border-t border-white/10">
                {error && (
                  <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                    {error}
                  </div>
                )}
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Reply to user..."
                    className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-emerald-500/50 transition-colors"
                    disabled={sending}
                    maxLength={5000}
                  />
                  <button
                    type="submit"
                    disabled={sending || !newMessage.trim()}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-medium transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-2"
                  >
                    {sending ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Reply
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Management (1/3 width) */}
            <div className="space-y-6">
              {/* Status & Priority */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Status</label>
                  <select
                    value={ticket.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    disabled={updating}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50 transition-colors capitalize disabled:opacity-50"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status} className="capitalize">
                        {status}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Priority</label>
                  <select
                    value={ticket.priority}
                    onChange={(e) => handlePriorityChange(e.target.value)}
                    disabled={updating}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50 transition-colors capitalize disabled:opacity-50"
                  >
                    {PRIORITY_OPTIONS.map((priority) => (
                      <option key={priority} value={priority} className="capitalize">
                        {priority}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Assign To</label>
                  <select
                    value={ticket.assignedTo?.id || ''}
                    onChange={(e) => handleAssign(e.target.value)}
                    disabled={updating}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50 transition-colors disabled:opacity-50"
                  >
                    <option value="">Unassigned</option>
                    <option value={currentUserId}>Assign to me</option>
                    <optgroup label="Other Agents">
                      {agents.filter(a => a.id !== currentUserId).map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name || agent.username}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-white/80">Quick Actions</h4>
                {ticket.status !== 'closed' && (
                  <button
                    onClick={() => handleStatusChange('closed')}
                    disabled={updating}
                    className="w-full px-4 py-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 hover:border-blue-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Close Ticket
                  </button>
                )}
                {!ticket.assignedTo && (
                  <button
                    onClick={() => handleAssign(currentUserId)}
                    disabled={updating}
                    className="w-full px-4 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <User className="w-4 h-4" />
                    Assign to Me
                  </button>
                )}
              </div>

              {/* Internal Notes */}
              <div className="pt-4 border-t border-white/10">
                <InternalNotes ticketId={ticketId} />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
