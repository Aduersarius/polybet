'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Check, X, Plus } from 'lucide-react';
import { format } from 'date-fns';

interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  usageCount: number;
  maxUses: number | null;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export default function AffiliateCodesPage() {
  const router = useRouter();
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newMaxUses, setNewMaxUses] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetchCodes();
  }, []);

  const fetchCodes = async () => {
    try {
      const response = await fetch('/api/affiliate/codes', {
        credentials: 'include',
      });

      if (response.status === 401) {
        router.push('/affiliate/login');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch codes');
      }

      const result = await response.json();
      setPromoCodes(result.promoCodes || []);
    } catch (err: any) {
      console.error('Error fetching codes:', err);
      setError(err.message || 'Failed to load codes');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePromoCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/affiliate/codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          code: newCode,
          description: newDescription || undefined,
          maxUses: newMaxUses ? parseInt(newMaxUses) : undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to create promo code');
        return;
      }

      await fetchCodes();
      setShowCreateModal(false);
      setNewCode('');
      setNewDescription('');
      setNewMaxUses('');
    } catch (err: any) {
      console.error('Error creating promo code:', err);
      setError(err.message || 'An error occurred');
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this promo code?')) {
      return;
    }

    try {
      const response = await fetch(`/api/affiliate/codes?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to deactivate promo code');
      }

      await fetchCodes();
    } catch (err: any) {
      console.error('Error deactivating promo code:', err);
      setError(err.message || 'An error occurred');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-white/5 bg-surface p-6">
          <div className="h-24 rounded-lg bg-white/5 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-200 mb-2">Promo Codes</h1>
          <p className="text-sm text-[#9ca3af]">Create and manage promo codes for your referrals</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-white text-black px-4 py-2 text-sm font-semibold hover:bg-gray-200 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Code
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {promoCodes.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-surface p-12 text-center">
          <p className="text-[#9ca3af] mb-4">No promo codes yet.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-white text-black px-6 py-3 text-sm font-semibold hover:bg-gray-200 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Your First Promo Code
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-white/5 bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left py-4 px-6 text-[#9ca3af] font-medium">Code</th>
                  <th className="text-left py-4 px-6 text-[#9ca3af] font-medium">Description</th>
                  <th className="text-right py-4 px-6 text-[#9ca3af] font-medium">Usage</th>
                  <th className="text-center py-4 px-6 text-[#9ca3af] font-medium">Status</th>
                  <th className="text-center py-4 px-6 text-[#9ca3af] font-medium">Expires</th>
                  <th className="text-center py-4 px-6 text-[#9ca3af] font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {promoCodes.map((pc) => {
                  const isExpired = pc.expiresAt && new Date(pc.expiresAt) < new Date();
                  const isMaxedOut = pc.maxUses && pc.usageCount >= pc.maxUses;
                  const isActive = pc.isActive && !isExpired && !isMaxedOut;

                  return (
                    <tr key={pc.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-semibold text-zinc-200">{pc.code}</span>
                          <button
                            onClick={() => copyToClipboard(pc.code, pc.id)}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                          >
                            {copied === pc.id ? (
                              <Check className="w-4 h-4 text-emerald-300" />
                            ) : (
                              <Copy className="w-4 h-4 text-[#9ca3af]" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-[#9ca3af]">
                        {pc.description || '-'}
                      </td>
                      <td className="text-right py-4 px-6">
                        <span className={isMaxedOut ? 'text-red-300' : 'text-zinc-200'}>
                          {pc.usageCount}
                          {pc.maxUses && ` / ${pc.maxUses}`}
                        </span>
                      </td>
                      <td className="text-center py-4 px-6">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            isActive
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : isExpired
                              ? 'bg-red-500/20 text-red-300'
                              : isMaxedOut
                              ? 'bg-yellow-500/20 text-yellow-300'
                              : 'bg-white/5 text-[#9ca3af]'
                          }`}
                        >
                          {isActive ? 'Active' : isExpired ? 'Expired' : isMaxedOut ? 'Maxed Out' : 'Inactive'}
                        </span>
                      </td>
                      <td className="text-center py-4 px-6 text-[#9ca3af] text-sm">
                        {pc.expiresAt ? format(new Date(pc.expiresAt), 'MMM dd, yyyy') : 'Never'}
                      </td>
                      <td className="text-center py-4 px-6">
                        {pc.isActive && (
                          <button
                            onClick={() => handleDeactivate(pc.id)}
                            className="p-2 text-red-300 hover:text-red-200 hover:bg-red-500/10 rounded transition-colors"
                            title="Deactivate"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="rounded-xl border border-white/5 bg-surface p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-zinc-200">Create Promo Code</h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewCode('');
                  setNewDescription('');
                  setNewMaxUses('');
                  setError('');
                }}
                className="p-1 hover:bg-white/10 rounded transition-colors"
              >
                <X className="w-5 h-5 text-[#9ca3af]" />
              </button>
            </div>
            <form onSubmit={handleCreatePromoCode} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Code *
                </label>
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  className="w-full px-4 py-3 bg-white/5 border border-white/5 rounded-lg text-zinc-200 placeholder-[#9ca3af] focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-colors"
                  placeholder="SAVE20"
                  required
                  minLength={3}
                  maxLength={20}
                />
                <p className="text-xs text-[#9ca3af] mt-1">Alphanumeric only, 3-20 characters</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/5 rounded-lg text-zinc-200 placeholder-[#9ca3af] focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-colors"
                  placeholder="Special discount code"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Max Uses (Optional)
                </label>
                <input
                  type="number"
                  value={newMaxUses}
                  onChange={(e) => setNewMaxUses(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/5 rounded-lg text-zinc-200 placeholder-[#9ca3af] focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-colors"
                  placeholder="Leave empty for unlimited"
                  min={1}
                />
              </div>
              <div className="flex gap-4 pt-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-white text-black rounded-lg transition-colors hover:bg-gray-200 font-semibold"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewCode('');
                    setNewDescription('');
                    setNewMaxUses('');
                    setError('');
                  }}
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/5 rounded-lg hover:bg-white/10 transition-colors text-zinc-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
