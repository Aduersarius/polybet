'use client';

import { useState, useEffect } from 'react';
import { StickyNote, Plus, User, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Note {
  id: string;
  content: string;
  createdAt: string;
  agent: {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
}

interface InternalNotesProps {
  ticketId: string;
}

export function InternalNotes({ ticketId }: InternalNotesProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchNotes();
  }, [ticketId]);

  const fetchNotes = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/support/tickets/${ticketId}/notes`);

      if (!response.ok) {
        throw new Error('Failed to fetch notes');
      }

      const data = await response.json();
      setNotes(data);
    } catch (err) {
      console.error('Error fetching notes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newNote.trim()) return;

    setAdding(true);
    setError('');

    try {
      const response = await fetch(`/api/support/tickets/${ticketId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newNote }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add note');
      }

      setNewNote('');
      await fetchNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-yellow-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <StickyNote className="w-5 h-5 text-yellow-400" />
        <h3 className="text-lg font-semibold text-white">Internal Notes</h3>
        <span className="text-xs text-white/40">(Support team only)</span>
      </div>

      {/* Add Note Form */}
      <form onSubmit={handleAddNote} className="space-y-2">
        {error && (
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add an internal note (only visible to support team)..."
          rows={3}
          className="w-full px-4 py-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-white placeholder-white/40 focus:outline-none focus:border-yellow-500/50 transition-colors resize-none"
          maxLength={5000}
        />
        <button
          type="submit"
          disabled={adding || !newNote.trim()}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-yellow-500/80 to-yellow-600/80 hover:from-yellow-500 hover:to-yellow-600 text-white font-medium transition-all shadow-lg shadow-yellow-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {adding ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              Add Note
            </>
          )}
        </button>
      </form>

      {/* Notes List */}
      <div className="space-y-3 mt-6">
        {notes.length === 0 ? (
          <div className="text-center py-6 text-white/40 text-sm">
            No internal notes yet
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20"
            >
              <div className="flex items-start gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-yellow-500/20 text-yellow-400 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-white">
                      {note.agent.name || note.agent.username || 'Agent'}
                    </span>
                    <span className="text-xs text-white/40 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm text-white/80 whitespace-pre-wrap">{note.content}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
