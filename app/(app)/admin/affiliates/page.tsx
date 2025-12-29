'use client';

import { useState, useEffect } from 'react';
import { requireAdminAuth } from '@/lib/auth';

interface Affiliate {
  id: string;
  email: string;
  name: string;
  referralCode: string;
  totalReferrals: number;
  activeReferrals: number;
  totalDeposits: number;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
}

interface AffiliateStats extends Affiliate {
  totalDepositAmount: number;
  totalRevenue: number;
  avgDepositPerUser: number;
}

export default function AdminAffiliatesPage() {
  const [affiliates, setAffiliates] = useState<AffiliateStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAffiliate, setSelectedAffiliate] = useState<string | null>(null);
  const [affiliateDetails, setAffiliateDetails] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchAffiliates();
  }, []);

  const fetchAffiliates = async () => {
    try {
      // Get all affiliates with their stats
      const response = await fetch('/api/admin/affiliates', {
        credentials: 'include',
      });

      if (response.status === 401 || response.status === 403) {
        window.location.href = '/';
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch affiliates');
      }

      const data = await response.json();
      setAffiliates(data.affiliates || []);
    } catch (err: any) {
      console.error('Error fetching affiliates:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAffiliateDetails = async (affiliateId: string) => {
    try {
      const [statsRes, referralsRes] = await Promise.all([
        fetch(`/api/affiliate/dashboard/stats?affiliateId=${affiliateId}`, {
          credentials: 'include',
        }),
        fetch(`/api/affiliate/dashboard/referrals?affiliateId=${affiliateId}`, {
          credentials: 'include',
        }),
      ]);

      const [stats, referrals] = await Promise.all([
        statsRes.json(),
        referralsRes.json(),
      ]);

      setAffiliateDetails({
        stats,
        referrals: referrals.referrals || [],
      });
    } catch (err: any) {
      console.error('Error fetching affiliate details:', err);
    }
  };

  const toggleAffiliateStatus = async (affiliateId: string, currentStatus: boolean) => {
    if (!confirm(`Are you sure you want to ${currentStatus ? 'deactivate' : 'activate'} this affiliate?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/affiliates/${affiliateId}/toggle`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to update affiliate status');
      }

      await fetchAffiliates();
    } catch (err: any) {
      console.error('Error updating affiliate status:', err);
      alert('Failed to update affiliate status');
    }
  };

  const filteredAffiliates = affiliates.filter((aff) =>
    aff.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    aff.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    aff.referralCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a] text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600 mb-6">
          Affiliate Management
        </h1>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, email, or referral code..."
            className="w-full max-w-md px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Affiliates Table */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-xl p-6 mb-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-gray-400">Name</th>
                  <th className="text-left py-3 px-4 text-gray-400">Email</th>
                  <th className="text-left py-3 px-4 text-gray-400">Referral Code</th>
                  <th className="text-right py-3 px-4 text-gray-400">Referrals</th>
                  <th className="text-right py-3 px-4 text-gray-400">Active</th>
                  <th className="text-right py-3 px-4 text-gray-400">Total Deposits ($)</th>
                  <th className="text-right py-3 px-4 text-gray-400">Total Revenue ($)</th>
                  <th className="text-center py-3 px-4 text-gray-400">Status</th>
                  <th className="text-center py-3 px-4 text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAffiliates.map((aff) => (
                  <tr key={aff.id} className="border-b border-white/5">
                    <td className="py-3 px-4">{aff.name}</td>
                    <td className="py-3 px-4 text-gray-400">{aff.email}</td>
                    <td className="py-3 px-4 font-mono text-sm">{aff.referralCode}</td>
                    <td className="text-right py-3 px-4">{aff.totalReferrals}</td>
                    <td className="text-right py-3 px-4 text-green-400">{aff.activeReferrals}</td>
                    <td className="text-right py-3 px-4">${aff.totalDepositAmount.toFixed(2)}</td>
                    <td className="text-right py-3 px-4 text-purple-400">
                      ${aff.totalRevenue.toFixed(2)}
                    </td>
                    <td className="text-center py-3 px-4">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          aff.isActive
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {aff.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="text-center py-3 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedAffiliate(aff.id);
                            fetchAffiliateDetails(aff.id);
                          }}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          View
                        </button>
                        <button
                          onClick={() => toggleAffiliateStatus(aff.id, aff.isActive)}
                          className={`text-sm ${
                            aff.isActive
                              ? 'text-red-400 hover:text-red-300'
                              : 'text-green-400 hover:text-green-300'
                          }`}
                        >
                          {aff.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Affiliate Details Modal */}
        {selectedAffiliate && affiliateDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold">Affiliate Details</h2>
                <button
                  onClick={() => {
                    setSelectedAffiliate(null);
                    setAffiliateDetails(null);
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">Total Referrals</div>
                  <div className="text-2xl font-bold">{affiliateDetails.stats.totalReferrals}</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">Active Referrals</div>
                  <div className="text-2xl font-bold text-green-400">
                    {affiliateDetails.stats.activeReferrals}
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">Total Revenue</div>
                  <div className="text-2xl font-bold text-purple-400">
                    ${affiliateDetails.stats.totalRevenue?.toFixed(2) || '0.00'}
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">Conversion Rate</div>
                  <div className="text-2xl font-bold">
                    {affiliateDetails.stats.conversionRate?.toFixed(1) || '0.0'}%
                  </div>
                </div>
              </div>

              {/* Referrals Table */}
              <div>
                <h3 className="text-xl font-semibold mb-4">Referrals</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-2 px-3 text-gray-400 text-sm">User</th>
                        <th className="text-left py-2 px-3 text-gray-400 text-sm">Signup</th>
                        <th className="text-right py-2 px-3 text-gray-400 text-sm">Deposits</th>
                        <th className="text-right py-2 px-3 text-gray-400 text-sm">Amount ($)</th>
                        <th className="text-right py-2 px-3 text-gray-400 text-sm">Revenue ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {affiliateDetails.referrals.slice(0, 10).map((ref: any) => (
                        <tr key={ref.userId} className="border-b border-white/5">
                          <td className="py-2 px-3 text-sm">{ref.username}</td>
                          <td className="py-2 px-3 text-sm text-gray-400">
                            {new Date(ref.signupDate).toLocaleDateString()}
                          </td>
                          <td className="text-right py-2 px-3 text-sm">{ref.depositCount}</td>
                          <td className="text-right py-2 px-3 text-sm">
                            ${ref.totalDepositAmount?.toFixed(2) || '0.00'}
                          </td>
                          <td className="text-right py-2 px-3 text-sm text-purple-400">
                            ${ref.totalRevenue?.toFixed(2) || '0.00'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Manual Payout Note */}
              <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-sm text-blue-400">
                  <strong>Manual Payout:</strong> Use the revenue data above to calculate and process
                  payouts manually. Payout automation will be implemented in a future update.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

