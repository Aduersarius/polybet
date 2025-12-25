'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, ArrowLeft, Clock, User, Paperclip, Download, FileText, Image as ImageIcon, File } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { FileUpload } from './FileUpload';

interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
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
  attachments: Attachment[];
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

interface TicketDetailProps {
  ticketId: string;
  onClose: () => void;
}

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'emerald', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  pending: { label: 'Pending', color: 'yellow', bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  resolved: { label: 'Resolved', color: 'blue', bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  closed: { label: 'Closed', color: 'gray', bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' },
};

export function TicketDetail({ ticketId, onClose }: TicketDetailProps) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState('');
  const [showAttachments, setShowAttachments] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return ImageIcon;
    if (type === 'application/pdf') return FileText;
    return File;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  useEffect(() => {
    fetchTicket();
  }, [ticketId]);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages]);

  const fetchTicket = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/support/tickets/${ticketId}`, {
        credentials: 'include',
      });
      
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
        credentials: 'include',
        body: JSON.stringify({ content: newMessage }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send message');
      }

      setNewMessage('');
      await fetchTicket(); // Refresh to get new message
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
        <div className="animate-spin rounded-full h-12 w-12 border-3 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
        <div className="max-w-md w-full p-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
          <p>{error}</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!ticket) return null;

  const statusConfig = STATUS_CONFIG[ticket.status];
  const canSendMessage = ticket.status !== 'closed';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-4xl h-[85vh] bg-gradient-to-br from-[#1a1f2e]/95 via-[#1a1d2e]/90 to-[#16181f]/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-blue-500/5 pointer-events-none" />

          {/* Header */}
          <div className="relative px-6 py-4 border-b border-white/10 flex-shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
                >
                  <ArrowLeft className="w-5 h-5 text-white/60 hover:text-white transition-colors" />
                </button>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-emerald-400">{ticket.ticketNumber}</span>
                    <div className={`px-2 py-0.5 rounded-md ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border} text-xs font-medium`}>
                      {statusConfig.label}
                    </div>
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">{ticket.subject}</h2>
                  <div className="flex items-center gap-3 text-xs text-white/50">
                    <span className="capitalize">{ticket.category.replace('_', ' ')}</span>
                    <span>•</span>
                    <span className="capitalize">{ticket.priority} priority</span>
                    {ticket.assignedTo && (
                      <>
                        <span>•</span>
                        <span>Assigned to {ticket.assignedTo.name || ticket.assignedTo.username}</span>
                      </>
                    )}
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

          {/* Messages */}
          <div className="relative flex-1 overflow-y-auto p-6 space-y-4">
            {ticket.messages.map((message, index) => {
              const isAgent = message.source === 'agent';
              const isCurrentUser = message.user.id === ticket.user.id;
              
              return (
                <div
                  key={message.id}
                  className={`flex gap-3 ${isCurrentUser && !isAgent ? 'flex-row-reverse' : ''}`}
                >
                  {/* Avatar */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isAgent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                    <User className="w-4 h-4" />
                  </div>

                  {/* Message Content */}
                  <div className={`flex-1 max-w-[70%] ${isCurrentUser && !isAgent ? 'items-end' : ''}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white">
                        {message.user.name || message.user.username || 'User'}
                      </span>
                      {isAgent && (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          Support
                        </span>
                      )}
                      <span className="text-xs text-white/40 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <div className={`p-3 rounded-xl ${isAgent ? 'bg-emerald-500/10 border border-emerald-500/20' : isCurrentUser ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-white/5 border border-white/10'}`}>
                      <p className="text-white/90 text-sm whitespace-pre-wrap break-words">{message.content}</p>
                      
                      {/* Attachments */}
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {message.attachments.map((attachment) => {
                            const Icon = getFileIcon(attachment.mimeType);
                            const isImage = attachment.mimeType.startsWith('image/');
                            
                            return (
                              <div key={attachment.id}>
                                {isImage ? (
                                  <a
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block rounded-lg overflow-hidden hover:opacity-90 transition-opacity"
                                  >
                                    <img
                                      src={attachment.url}
                                      alt={attachment.fileName}
                                      className="max-w-full h-auto max-h-64 object-contain"
                                    />
                                  </a>
                                ) : (
                                  <a
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all group"
                                  >
                                    <div className="p-1.5 rounded bg-blue-500/20">
                                      <Icon className="w-3.5 h-3.5 text-blue-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs text-white/80 font-medium truncate group-hover:text-white transition-colors">
                                        {attachment.fileName}
                                      </p>
                                      <p className="text-xs text-white/40">{formatFileSize(attachment.fileSize)}</p>
                                    </div>
                                    <Download className="w-3.5 h-3.5 text-white/40 group-hover:text-white transition-colors" />
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          {canSendMessage ? (
            <div className="relative border-t border-white/10 flex-shrink-0">
              <form onSubmit={handleSendMessage} className="px-6 py-4">
                {error && (
                  <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                    {error}
                  </div>
                )}
                
                <div className="flex gap-3 mb-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-emerald-500/50 transition-colors"
                    disabled={sending}
                    maxLength={5000}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAttachments(!showAttachments)}
                    className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:border-emerald-500/30 text-white/60 hover:text-emerald-400 transition-all"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <button
                    type="submit"
                    disabled={sending || !newMessage.trim()}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-medium transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {sending ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send
                      </>
                    )}
                  </button>
                </div>

                {/* Attachments */}
                {showAttachments && (
                  <div className="mt-3">
                    <FileUpload
                      ticketId={ticketId}
                      onUploadComplete={() => fetchTicket()}
                      onUploadError={(error) => setError(error)}
                      maxFiles={3}
                    />
                  </div>
                )}
              </form>
            </div>
          ) : (
            <div className="relative px-6 py-4 border-t border-white/10 text-center text-sm text-white/50">
              This ticket is closed. Contact support to reopen if needed.
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

