'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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

interface LinksResponse {
  referralLink: string;
  promoCodes: PromoCode[];
}

export default function AffiliateLinksPage() {
  const router = useRouter();
  const [data, setData] = useState<LinksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newMaxUses, setNewMaxUses] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLinks();
  }, []);

  const fetchLinks = async () => {
    try {
      const response = await fetch('/api/affiliate/links', {
        credentials: 'include',
      });

      if (response.status === 401) {
        router.push('/affiliate/login');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch links');
      }

      const result = await response.json();
      setData(result);
    } catch (err: any) {
      console.error('Error fetching links:', err);
      setError(err.message || 'Failed to load links');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePromoCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/affiliate/links', {
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

      // Refresh links
      await fetchLinks();
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
      const response = await fetch(`/api/affiliate/links?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to deactivate promo code');
      }

      await fetchLinks();
    } catch (err: any) {
      console.error('Error deactivating promo code:', err);
      setError(err.message || 'An error occurred');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a] text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href="/affiliate/dashboard"
            className="text-blue-400 hover:text-blue-300 mb-4 inline-block"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
            Tracking Links
          </h1>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Referral Link */}
            <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-xl p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Your Referral Link</h2>
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  value={data.referralLink}
                  readOnly
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
                />
                <button
                  onClick={() => copyToClipboard(data.referralLink)}
                  className="px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Promo Codes */}
            <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Promo Codes</h2>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
                >
                  Create Promo Code
                </button>
              </div>

              {data.promoCodes.length === 0 ? (
                <p className="text-gray-400">No promo codes yet. Create one to get started!</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-3 px-4 text-gray-400">Code</th>
                        <th className="text-left py-3 px-4 text-gray-400">Description</th>
                        <th className="text-right py-3 px-4 text-gray-400">Usage</th>
                        <th className="text-center py-3 px-4 text-gray-400">Status</th>
                        <th className="text-center py-3 px-4 text-gray-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.promoCodes.map((pc) => (
                        <tr key={pc.id} className="border-b border-white/5">
                          <td className="py-3 px-4 font-mono">{pc.code}</td>
                          <td className="py-3 px-4 text-gray-400">
                            {pc.description || '-'}
                          </td>
                          <td className="text-right py-3 px-4">
                            {pc.usageCount}
                            {pc.maxUses && ` / ${pc.maxUses}`}
                          </td>
                          <td className="text-center py-3 px-4">
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                pc.isActive
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-gray-500/20 text-gray-400'
                              }`}
                            >
                              {pc.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="text-center py-3 px-4">
                            {pc.isActive && (
                              <button
                                onClick={() => handleDeactivate(pc.id)}
                                className="text-red-400 hover:text-red-300 text-sm"
                              >
                                Deactivate
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-semibold mb-4">Create Promo Code</h3>
              <form onSubmit={handleCreatePromoCode} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Code *
                  </label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
                    placeholder="SAVE20"
                    required
                    pattern="[A-Z0-9]+"
                    minLength={3}
                    maxLength={20}
                  />
                  <p className="text-xs text-gray-500 mt-1">Alphanumeric only, 3-20 characters</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description (Optional)
                  </label>
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
                    placeholder="Special discount code"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Max Uses (Optional)
                  </label>
                  <input
                    type="number"
                    value={newMaxUses}
                    onChange={(e) => setNewMaxUses(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white"
                    placeholder="Leave empty for unlimited"
                    min={1}
                  />
                </div>
                <div className="flex gap-4">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
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
                    }}
                    className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

