'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Minimize2, Plus, Send, ArrowLeft, Clock, User, Paperclip } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { useSession } from '@/lib/auth-client';
import { useSupportChat } from '@/contexts/SupportChatContext';
import { FileUpload } from './FileUpload';
import { toast } from '@/components/ui/use-toast';

type View = 'list' | 'create' | 'chat';

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

interface Message {
  id: string;
  content: string;
  createdAt: string;
  source: 'web' | 'telegram' | 'agent';
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
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    username: string | null;
  };
  assignedTo: {
    id: string;
    name: string | null;
    username: string | null;
  } | null;
  messages: Message[];
}

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'blue', bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-400/20' },
  pending: { label: 'Pending', color: 'yellow', bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  resolved: { label: 'Resolved', color: 'blue', bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  closed: { label: 'Closed', color: 'gray', bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' },
};

const CATEGORIES = [
  { value: 'deposit', label: 'Deposit Issue', color: 'blue' },
  { value: 'withdrawal', label: 'Withdrawal Issue', color: 'purple' },
  { value: 'dispute', label: 'Trade Dispute', color: 'orange' },
  { value: 'bug', label: 'Bug Report', color: 'red' },
  { value: 'kyc', label: 'KYC/Verification', color: 'yellow' },
  { value: 'general', label: 'General Question', color: 'gray' },
] as const;

export function SupportChatWidget() {
  const [mounted, setMounted] = useState(false);
  const { data: session, isPending } = useSession() as { data: any; isPending: boolean };
  const { isChatOpen: isOpen, isChatMinimized, closeChat, minimizeChat, maximizeChat, openChat } = useSupportChat();
  const [currentView, setCurrentView] = useState<View>('list');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    subject: '',
    category: 'general' as const,
    message: '',
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Ensure component only renders on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Listen for open-support-chat custom event (from notification bell)
  useEffect(() => {
    if (!mounted) return;

    const handleOpenSupportChat = (event: any) => {
      const { ticketId } = event.detail || {};
      if (ticketId) {
        openChat();
        setSelectedTicketId(ticketId);
        setCurrentView('chat');
        // Fetch ticket detail will be triggered by the selectedTicketId change
      } else {
        openChat();
      }
    };

    window.addEventListener('open-support-chat', handleOpenSupportChat as EventListener);
    return () => {
      window.removeEventListener('open-support-chat', handleOpenSupportChat as EventListener);
    };
  }, [mounted, openChat]);

  // Update unread count (simplified - count all messages in open/pending tickets)
  // Defined first because fetchTickets depends on it
  const updateUnreadCount = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      const response = await fetch('/api/support/tickets?sortBy=createdAt&sortOrder=desc', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn('Failed to update unread count: response not ok', response.status, response.statusText);
        return;
      }

      const data = await response.json();
      const openTickets = (data.data || []).filter(
        (t: Ticket) => t.status === 'open' || t.status === 'pending'
      );
      const totalMessages = openTickets.reduce((sum: number, t: Ticket) => sum + (t._count?.messages || 0), 0);
      setUnreadCount(totalMessages);
    } catch (err) {
      // Silently fail - this is a background operation and shouldn't break the UI
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to update unread count:', err);
      }
    }
  }, [session?.user?.id]);

  // Fetch tickets
  const fetchTickets = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      setLoading(true);
      const response = await fetch('/api/support/tickets?sortBy=createdAt&sortOrder=desc', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('Failed to fetch tickets:', response.status, response.statusText);
        // On error, try to restore from localStorage
        try {
          const stored = localStorage.getItem(`support_tickets_${session.user.id}`);
          if (stored) {
            const parsedTickets = JSON.parse(stored);
            setTickets(parsedTickets);
          }
        } catch {
          // Ignore localStorage errors
        }
        return;
      }

      const data = await response.json();
      const ticketsData = data.data || [];
      setTickets(ticketsData);

      // Persist tickets to localStorage
      try {
        localStorage.setItem(`support_tickets_${session.user.id}`, JSON.stringify(ticketsData));
      } catch {
        // Ignore localStorage errors
      }

      // Update unread count separately - don't let it block ticket fetching
      updateUnreadCount().catch(() => {
        // Silently fail - unread count update is not critical
      });
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
      // On error, try to restore from localStorage
      if (session?.user?.id) {
        try {
          const stored = localStorage.getItem(`support_tickets_${session.user.id}`);
          if (stored) {
            const parsedTickets = JSON.parse(stored);
            setTickets(parsedTickets);
          }
        } catch {
          // Ignore localStorage errors
        }
      }
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, updateUnreadCount]);

  // Fetch ticket detail
  const fetchTicketDetail = useCallback(async (ticketId: string) => {
    if (!ticketId) {
      setTicketDetail(null);
      return;
    }

    try {
      const response = await fetch(`/api/support/tickets/${ticketId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        // On error, try to restore from localStorage
        if (session?.user?.id) {
          try {
            const stored = localStorage.getItem(`support_ticket_detail_${ticketId}_${session.user.id}`);
            if (stored) {
              const parsedDetail = JSON.parse(stored);
              setTicketDetail(parsedDetail);
            }
          } catch {
            // Ignore localStorage errors
          }
        }
        return;
      }

      const data = await response.json();
      setTicketDetail(data);

      // Persist ticket detail to localStorage
      if (session?.user?.id) {
        try {
          localStorage.setItem(`support_ticket_detail_${ticketId}_${session.user.id}`, JSON.stringify(data));
        } catch {
          // Ignore localStorage errors
        }
      }

      // Scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      console.error('Failed to fetch ticket detail:', err);
      // On error, try to restore from localStorage
      if (session?.user?.id && ticketId) {
        try {
          const stored = localStorage.getItem(`support_ticket_detail_${ticketId}_${session.user.id}`);
          if (stored) {
            const parsedDetail = JSON.parse(stored);
            setTicketDetail(parsedDetail);
          }
        } catch {
          // Ignore localStorage errors
        }
      }
    }
  }, [session?.user?.id]);

  // Fetch ticket detail when selectedTicketId changes
  useEffect(() => {
    if (selectedTicketId && currentView === 'chat') {
      fetchTicketDetail(selectedTicketId);
    } else if (!selectedTicketId) {
      // Clear ticket detail when selectedTicketId is cleared
      setTicketDetail(null);
    }
  }, [selectedTicketId, currentView, fetchTicketDetail]);

  // Restore tickets from localStorage on mount
  useEffect(() => {
    if (mounted && session?.user?.id) {
      try {
        const storedTickets = localStorage.getItem(`support_tickets_${session.user.id}`);
        const storedSelectedId = localStorage.getItem(`support_selected_ticket_${session.user.id}`);

        if (storedTickets) {
          const parsedTickets = JSON.parse(storedTickets);
          setTickets(parsedTickets);
        }

        if (storedSelectedId) {
          setSelectedTicketId(storedSelectedId);

          // Try to restore ticket detail from localStorage
          try {
            const storedDetail = localStorage.getItem(`support_ticket_detail_${storedSelectedId}_${session.user.id}`);
            if (storedDetail) {
              const parsedDetail = JSON.parse(storedDetail);
              setTicketDetail(parsedDetail);
            }
          } catch {
            // Ignore localStorage errors for detail
          }

          // Optionally restore the view to chat if there's a selected ticket and widget is open
          if (isOpen) {
            setCurrentView('chat');
            // Fetch fresh ticket detail in background
            fetchTicketDetail(storedSelectedId);
          }
        }
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [mounted, session?.user?.id, isOpen, fetchTicketDetail]);

  // Load tickets when widget opens
  useEffect(() => {
    if (isOpen && currentView === 'list') {
      fetchTickets();
    }
  }, [isOpen, currentView, fetchTickets]);

  // Initial unread count
  useEffect(() => {
    if (session?.user?.id) {
      updateUnreadCount();
      // Poll for unread count every 30 seconds
      const interval = setInterval(updateUnreadCount, 30000);
      return () => clearInterval(interval);
    }
  }, [session, updateUnreadCount]);

  // WebSocket setup (client-side only) - after function definitions
  useEffect(() => {
    if (typeof window === 'undefined' || !mounted || !session?.user?.id) return;

    let socketInstance: any = null;
    let handleUserUpdate: ((data: any) => void) | null = null;
    const userId = session.user.id;

    // Dynamically import socket only on client side
    import('@/lib/socket').then(({ socket }) => {
      socketInstance = socket;

      // Join user room for real-time updates
      socket.emit('join-user-room', userId);

      // Listen for support updates
      handleUserUpdate = (data: any) => {
        if (data.type === 'SUPPORT_MESSAGE' || data.type === 'TICKET_UPDATE') {
          const isAgentMessage = data.payload?.source === 'agent';
          const isCurrentUserTicket = selectedTicketId === data.payload?.ticketId;

          // Show toast notification if message is from agent and not currently viewing that ticket
          if (isAgentMessage && !isCurrentUserTicket) {
            toast({
              title: 'Support Reply',
              description: `You have a new reply from support${data.payload?.username ? ` from ${data.payload.username}` : ''}`,
            });
          }

          // Refresh tickets if on list view
          if (currentView === 'list') {
            fetchTickets();
          }
          // Refresh ticket detail if viewing that ticket
          if (currentView === 'chat' && selectedTicketId && selectedTicketId === data.payload?.ticketId) {
            fetchTicketDetail(selectedTicketId);
          }
          // Update unread count - don't let errors block WebSocket updates
          updateUnreadCount().catch(() => {
            // Silently fail - unread count update is not critical
          });
        }
      };

      socket.on('user-update', handleUserUpdate);
    }).catch((err) => {
      console.warn('Failed to load WebSocket client:', err);
    });

    return () => {
      if (socketInstance && handleUserUpdate) {
        socketInstance.off('user-update', handleUserUpdate);
        socketInstance.emit('leave-user-room', userId);
      }
    };
  }, [mounted, session?.user?.id, currentView, selectedTicketId]);

  // Handle ticket click
  const handleTicketClick = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setCurrentView('chat');

    // Persist selected ticket ID
    if (session?.user?.id) {
      try {
        localStorage.setItem(`support_selected_ticket_${session.user.id}`, ticketId);
      } catch {
        // Ignore localStorage errors
      }
    }

    fetchTicketDetail(ticketId);
  };

  // Handle send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedTicketId) return;

    setSending(true);
    try {
      const response = await fetch(`/api/support/tickets/${selectedTicketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: newMessage }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      setNewMessage('');
      await fetchTicketDetail(selectedTicketId);

      // Update unread count separately - don't let it block message sending
      updateUnreadCount().catch(() => {
        // Silently fail - unread count update is not critical
      });
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  // Handle create ticket
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createFormData.subject || !createFormData.message) return;

    setSending(true);
    let response: Response | null = null;
    try {
      response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject: createFormData.subject,
          category: createFormData.category,
          priority: 'medium',
          initialMessage: createFormData.message,
          source: 'web',
        }),
      });

      // Check response status first
      if (!response.ok) {
        // Try to read error message, but don't fail if we can't
        let errorMessage = `Failed to create ticket (${response.status})`;
        try {
          // Clone response to avoid consuming the body if it fails
          const clonedResponse = response.clone();
          const errorData = await clonedResponse.json().catch(() => null);
          if (errorData?.error) {
            errorMessage = errorData.error;
          } else {
            errorMessage = response.statusText || errorMessage;
          }
        } catch {
          // If we can't parse error, use status text or default message
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Read response body only once
      let ticket;
      try {
        ticket = await response.json();
      } catch (err) {
        console.error('Failed to parse ticket response:', err);
        throw new Error('Failed to parse server response. Please try again.');
      }

      setCreateFormData({ subject: '', category: 'general', message: '' });
      setCurrentView('chat');
      setSelectedTicketId(ticket.id);

      // Fetch ticket detail and tickets, but don't wait for unread count update
      await fetchTicketDetail(ticket.id);
      await fetchTickets();

      // Update unread count separately with error handling
      updateUnreadCount().catch(() => {
        // Silently fail - unread count is not critical
      });
    } catch (err) {
      console.error('Failed to create ticket:', err);

      // Provide more helpful error message
      let errorMessage = 'Failed to create ticket. Please try again.';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err instanceof TypeError && err.message.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }

      // Show user-friendly error message
      alert(errorMessage);
    } finally {
      setSending(false);
    }
  };

  // Debug logging
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('[SupportChatWidget] Render check:', {
        hasSession: !!session,
        hasUser: !!session?.user,
        userId: session?.user?.id,
      });
    }
  }, [session]);

  // Don't render until mounted (client-side only)
  if (!mounted) {
    return null;
  }

  // Don't show widget if not authenticated or still loading
  if (isPending || !session?.user) {
    return null;
  }

  // If minimized, show only header bar attached to bottom (same width as expanded window)
  if (isChatMinimized && isOpen) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-0 right-6 z-50 w-[380px] bg-gradient-to-br from-[#1a1f2e]/95 via-[#1a1d2e]/90 to-[#16181f]/95 backdrop-blur-xl rounded-t-2xl border-t border-l border-r border-white/10 shadow-2xl"
      >
        <div className="relative px-4 py-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Support</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={maximizeChat}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Maximize"
            >
              <Minimize2 className="w-4 h-4 text-white/60 hover:text-white rotate-180" />
            </button>
            <button
              onClick={() => {
                closeChat();
                setCurrentView('list');
                setSelectedTicketId(null);
                setTicketDetail(null);
                // Clear persisted selected ticket
                if (session?.user?.id) {
                  try {
                    localStorage.removeItem(`support_selected_ticket_${session.user.id}`);
                  } catch {
                    // Ignore localStorage errors
                  }
                }
              }}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-white/60 hover:text-white" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Chat Widget - only shown when isOpen is true (controlled by context)
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-6 right-6 z-50 w-[380px] h-[600px] rounded-2xl border border-blue-400/10 shadow-2xl flex flex-col overflow-hidden sm:w-[380px]"
          style={{
            backgroundColor: 'var(--surface)',
            maxHeight: 'calc(100vh - 3rem)',
            maxWidth: 'calc(100vw - 3rem)',
            boxShadow: '0 8px 32px rgba(59, 130, 246, 0.15)'
          }}
        >

          {/* Header */}
          <div className="relative px-4 py-3 border-b border-white/10 flex-shrink-0 flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Support</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={minimizeChat}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Minimize"
              >
                <Minimize2 className="w-4 h-4 text-white/60 hover:text-white" />
              </button>
              <button
                onClick={() => {
                  closeChat();
                  setCurrentView('list');
                  setSelectedTicketId(null);
                  setTicketDetail(null);
                  // Clear persisted selected ticket
                  if (session?.user?.id) {
                    try {
                      localStorage.removeItem(`support_selected_ticket_${session.user.id}`);
                    } catch {
                      // Ignore localStorage errors
                    }
                  }
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-white/60 hover:text-white" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="relative flex-1 overflow-hidden flex flex-col">
            {currentView === 'list' && (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-white/80">Your Tickets</h4>
                  <button
                    onClick={() => setCurrentView('create')}
                    className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-xs font-medium transition-all flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New
                  </button>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageCircle className="w-12 h-12 text-white/20 mx-auto mb-3" />
                    <p className="text-sm text-white/60 mb-4">No tickets yet</p>
                    <button
                      onClick={() => setCurrentView('create')}
                      className="px-4 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-sm font-medium transition-colors border border-blue-500/20"
                    >
                      Create Ticket
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tickets.map((ticket) => {
                      const statusConfig = STATUS_CONFIG[ticket.status];
                      return (
                        <button
                          key={ticket.id}
                          onClick={() => handleTicketClick(ticket.id)}
                          className="w-full p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-400/30 transition-all text-left"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-mono text-blue-400">
                                  {ticket.ticketNumber}
                                </span>
                                <div className={`px-2 py-0.5 rounded-md ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border} text-xs font-medium`}>
                                  {statusConfig.label}
                                </div>
                              </div>
                              <h5 className="text-sm font-medium text-white truncate mb-1">
                                {ticket.subject}
                              </h5>
                              <div className="flex items-center gap-2 text-xs text-white/50">
                                <span className="capitalize">{ticket.category.replace('_', ' ')}</span>
                                <span>•</span>
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-white/50">
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>{ticket._count.messages} {ticket._count.messages === 1 ? 'message' : 'messages'}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {currentView === 'create' && (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => setCurrentView('list')}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4 text-white/60" />
                  </button>
                  <h4 className="text-sm font-semibold text-white/80">Create Ticket</h4>
                </div>
                <form onSubmit={handleCreateTicket} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-white/80 mb-1.5">
                      Subject <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={createFormData.subject}
                      onChange={(e) => setCreateFormData({ ...createFormData, subject: e.target.value })}
                      placeholder="Brief description"
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-blue-400/30 transition-colors text-sm"
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/80 mb-1.5">
                      Category <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={createFormData.category}
                      onChange={(e) => setCreateFormData({ ...createFormData, category: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-400/30 transition-colors text-sm"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/80 mb-1.5">
                      Message <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      required
                      value={createFormData.message}
                      onChange={(e) => setCreateFormData({ ...createFormData, message: e.target.value })}
                      placeholder="Describe your issue..."
                      rows={6}
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-blue-400/30 transition-colors resize-none text-sm"
                      maxLength={5000}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={sending || !createFormData.subject || !createFormData.message}
                    className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                  >
                    {sending ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Create Ticket
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}

            {currentView === 'chat' && ticketDetail && (
              <>
                <div className="px-4 py-3 border-b border-white/10 flex-shrink-0">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => {
                        // Capture ticketId before clearing
                        const ticketIdToClear = selectedTicketId;

                        // Clear state
                        setCurrentView('list');
                        setSelectedTicketId(null);
                        setTicketDetail(null);

                        // Clear persisted selected ticket from localStorage
                        if (session?.user?.id) {
                          try {
                            localStorage.removeItem(`support_selected_ticket_${session.user.id}`);
                            if (ticketIdToClear) {
                              localStorage.removeItem(`support_ticket_detail_${ticketIdToClear}_${session.user.id}`);
                            }
                          } catch {
                            // Ignore localStorage errors
                          }
                        }
                      }}
                      className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4 text-white/60" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-blue-400">{ticketDetail.ticketNumber}</span>
                        <div className={`px-2 py-0.5 rounded-md ${STATUS_CONFIG[ticketDetail.status].bg} ${STATUS_CONFIG[ticketDetail.status].text} border ${STATUS_CONFIG[ticketDetail.status].border} text-xs font-medium`}>
                          {STATUS_CONFIG[ticketDetail.status].label}
                        </div>
                      </div>
                      <h4 className="text-sm font-semibold text-white truncate">{ticketDetail.subject}</h4>
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {ticketDetail.messages.map((message) => {
                    const isAgent = message.source === 'agent';
                    const isCurrentUser = message.user.id === ticketDetail.user.id;

                    return (
                      <div
                        key={message.id}
                        className={`flex gap-2 ${isCurrentUser && !isAgent ? 'flex-row-reverse' : ''}`}
                      >
                        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${isAgent ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 text-white/80'}`}>
                          <User className="w-3.5 h-3.5" />
                        </div>
                        <div className={`flex-1 max-w-[75%] ${isCurrentUser && !isAgent ? 'items-end' : ''}`}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs font-medium text-white">
                              {message.user.name || message.user.username || 'User'}
                            </span>
                            {isAgent && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-400/30">
                                Support
                              </span>
                            )}
                            <span className="text-xs text-white/40 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          <div className={`p-2.5 rounded-xl text-sm ${isAgent ? 'bg-blue-500/10 border border-blue-400/20' : isCurrentUser ? 'bg-white/10 border border-white/20' : 'bg-white/5 border border-white/10'}`}>
                            <p className="text-white/90 whitespace-pre-wrap break-words">{message.content}</p>
                            {message.attachments && message.attachments.length > 0 && (
                              <div className="mt-2 space-y-1.5">
                                {message.attachments.map((attachment) => (
                                  <a
                                    key={attachment.id}
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 p-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs"
                                  >
                                    <Paperclip className="w-3 h-3 text-white/60" />
                                    <span className="text-white/80 truncate">{attachment.fileName}</span>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
                {ticketDetail.status !== 'closed' && (
                  <div className="border-t border-white/10 flex-shrink-0 p-4">
                    <form onSubmit={handleSendMessage} className="flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-blue-400/30 transition-colors text-sm"
                        disabled={sending}
                        maxLength={5000}
                      />
                      <button
                        type="submit"
                        disabled={sending || !newMessage.trim()}
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                    {showAttachments && selectedTicketId && (
                      <div className="mt-2">
                        <FileUpload
                          ticketId={selectedTicketId}
                          onUploadComplete={() => {
                            if (selectedTicketId) fetchTicketDetail(selectedTicketId);
                            setShowAttachments(false);
                          }}
                          onUploadError={(error) => console.error(error)}
                          maxFiles={3}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowAttachments(!showAttachments)}
                      className="mt-2 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      <Paperclip className="w-3 h-3" />
                      {showAttachments ? 'Hide attachments' : 'Add attachments'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


