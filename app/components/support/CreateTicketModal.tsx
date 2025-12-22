'use client';

import { useState } from 'react';
import { X, Send, Paperclip } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUpload } from './FileUpload';

interface CreateTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORIES = [
  { value: 'deposit', label: 'Deposit Issue', color: 'blue' },
  { value: 'withdrawal', label: 'Withdrawal Issue', color: 'purple' },
  { value: 'dispute', label: 'Trade Dispute', color: 'orange' },
  { value: 'bug', label: 'Bug Report', color: 'red' },
  { value: 'kyc', label: 'KYC/Verification', color: 'yellow' },
  { value: 'general', label: 'General Question', color: 'gray' },
] as const;

export function CreateTicketModal({ isOpen, onClose, onSuccess }: CreateTicketModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null);
  const [showAttachments, setShowAttachments] = useState(false);
  
  const [formData, setFormData] = useState({
    subject: '',
    category: 'general' as const,
    message: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject: formData.subject,
          category: formData.category,
          priority: 'medium',
          initialMessage: formData.message,
          source: 'web',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create ticket');
      }

      const ticket = await response.json();
      setCreatedTicketId(ticket.id);

      // If attachments were added, keep modal open briefly to show upload status
      // Otherwise close immediately
      if (!showAttachments) {
        // Reset form
        setFormData({
          subject: '',
          category: 'general',
          message: '',
        });

        onSuccess();
        onClose();
      } else {
        // Wait a moment for attachments to finish uploading
        setTimeout(() => {
          setFormData({
            subject: '',
            category: 'general',
            priority: 'medium',
            message: '',
          });
          setCreatedTicketId(null);
          setShowAttachments(false);
          onSuccess();
          onClose();
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-2xl bg-gradient-to-br from-[#1a1f2e]/95 via-[#1a1d2e]/90 to-[#16181f]/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        >
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-blue-500/5 pointer-events-none" />

          {/* Header */}
          <div className="relative px-6 py-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Create Support Ticket</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                disabled={loading}
              >
                <X className="w-5 h-5 text-white/60 hover:text-white transition-colors" />
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="relative p-6 space-y-5">
            {/* Error message */}
            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Subject <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Brief description of your issue"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-emerald-500/50 transition-colors"
                maxLength={200}
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Category <span className="text-red-400">*</span>
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Message <span className="text-red-400">*</span>
              </label>
              <textarea
                required
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Please describe your issue in detail..."
                rows={6}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none"
                maxLength={5000}
              />
              <p className="text-xs text-white/40 mt-1">
                {formData.message.length}/5000 characters
              </p>
            </div>

            {/* Attachments Toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowAttachments(!showAttachments)}
                className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <Paperclip className="w-4 h-4" />
                {showAttachments ? 'Hide attachments' : 'Add attachments (optional)'}
              </button>
            </div>

            {/* File Upload */}
            {showAttachments && (
              <div>
                <FileUpload
                  ticketId={createdTicketId || undefined}
                  disabled={!createdTicketId}
                  onUploadError={(error) => setError(error)}
                />
                {!createdTicketId && (
                  <p className="text-xs text-white/40 mt-2">
                    Create the ticket first, then upload attachments
                  </p>
                )}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex items-center justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !formData.subject || !formData.message}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-medium transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Create Ticket
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
