'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, DollarSign, TrendingUp, CheckCircle2, XCircle, Clock, Eye } from 'lucide-react';

interface Affiliate {
  id: string;
  email: string;
  name: string;
  referralCode: string;
  totalReferrals: number;
  activeReferrals: number;
  totalDeposits: number;
  totalDepositAmount: number;
  totalRevenue: number;
  avgDepositPerUser: number;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
}

interface PayoutRequest {
  id: string;
  affiliateId: string;
  affiliateName: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
  requestedAt: string;
  processedAt?: string;
  notes?: string;
}

export function AdminAffiliates() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAffiliate, setSelectedAffiliate] = useState<string | null>(null);
  const [affiliateDetails, setAffiliateDetails] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'performance' | 'payouts'>('performance');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [affiliatesRes, payoutsRes] = await Promise.all([
        fetch('/api/admin/affiliates', { credentials: 'include' }),
        fetch('/api/admin/affiliates/payouts', { credentials: 'include' }),
      ]);

      if (affiliatesRes.ok) {
        const affiliatesData = await affiliatesRes.json();
        setAffiliates(affiliatesData.affiliates || []);
      }

      if (payoutsRes.ok) {
        const payoutsData = await payoutsRes.json();
        setPayoutRequests(payoutsData.payouts || []);
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
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

  const handlePayoutAction = async (payoutId: string, action: 'APPROVE' | 'REJECT' | 'PAY') => {
    if (!confirm(`Are you sure you want to ${action.toLowerCase()} this payout request?`)) {
      return;
    }

    try {
      const response = await fetch('/api/admin/affiliates/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ payoutId, action }),
      });

      if (!response.ok) {
        throw new Error('Failed to update payout');
      }

      await fetchData();
    } catch (err: any) {
      console.error('Error updating payout:', err);
      alert('Failed to update payout');
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

      await fetchData();
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

  const pendingPayouts = payoutRequests.filter(p => p.status === 'PENDING');
  const totalPendingAmount = pendingPayouts.reduce((sum, p) => sum + p.amount, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="border-0 bg-surface">
          <CardHeader>
            <CardTitle className="text-zinc-200">Affiliates</CardTitle>
            <CardDescription>Loading affiliate data…</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-24 rounded-lg bg-white/5 animate-pulse" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-200">Affiliate Management</h2>
          <p className="text-sm text-[#9ca3af] mt-1">View affiliate performance and manage payout requests</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/5 bg-surface p-5 shadow-lg shadow-black/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#9ca3af]">Total Affiliates</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-200">{affiliates.length}</p>
              <p className="text-xs text-[#9ca3af]">{affiliates.filter(a => a.isActive).length} active</p>
            </div>
            <div className="rounded-lg bg-white/5 p-2">
              <Users className="h-5 w-5 text-blue-300" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-surface p-5 shadow-lg shadow-black/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#9ca3af]">Total Revenue</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-200">
                ${affiliates.reduce((sum, a) => sum + (a.totalRevenue || 0), 0).toFixed(2)}
              </p>
              <p className="text-xs text-[#9ca3af]">From all affiliates</p>
            </div>
            <div className="rounded-lg bg-white/5 p-2">
              <DollarSign className="h-5 w-5 text-emerald-300" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-surface p-5 shadow-lg shadow-black/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#9ca3af]">Pending Payouts</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-200">{pendingPayouts.length}</p>
              <p className="text-xs text-[#9ca3af]">${totalPendingAmount.toFixed(2)} total</p>
            </div>
            <div className="rounded-lg bg-white/5 p-2">
              <Clock className="h-5 w-5 text-yellow-300" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-surface p-5 shadow-lg shadow-black/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#9ca3af]">Total Referrals</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-200">
                {affiliates.reduce((sum, a) => sum + a.totalReferrals, 0)}
              </p>
              <p className="text-xs text-[#9ca3af]">Across all affiliates</p>
            </div>
            <div className="rounded-lg bg-white/5 p-2">
              <TrendingUp className="h-5 w-5 text-purple-300" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 border-b border-white/5">
        <button
          onClick={() => setActiveTab('performance')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'performance'
              ? 'border-b-2 border-[#3b82f6] text-[#3b82f6]'
              : 'text-[#9ca3af] hover:text-zinc-200'
          }`}
        >
          Performance
        </button>
        <button
          onClick={() => setActiveTab('payouts')}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === 'payouts'
              ? 'border-b-2 border-[#3b82f6] text-[#3b82f6]'
              : 'text-[#9ca3af] hover:text-zinc-200'
          }`}
        >
          Payout Requests
          {pendingPayouts.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-yellow-500/20 text-yellow-300 rounded-full text-xs">
              {pendingPayouts.length}
            </span>
          )}
        </button>
      </div>

      {/* Performance Tab */}
      {activeTab === 'performance' && (
        <Card className="border-0 bg-surface">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-zinc-200">Affiliate Performance</CardTitle>
                <CardDescription>View and manage affiliate accounts</CardDescription>
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, email, or code..."
                className="px-4 py-2 bg-white/5 border border-white/5 rounded-lg text-zinc-200 placeholder-[#9ca3af] focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] text-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left py-3 px-4 text-[#9ca3af] font-medium">Name</th>
                    <th className="text-left py-3 px-4 text-[#9ca3af] font-medium">Email</th>
                    <th className="text-left py-3 px-4 text-[#9ca3af] font-medium">Code</th>
                    <th className="text-right py-3 px-4 text-[#9ca3af] font-medium">Referrals</th>
                    <th className="text-right py-3 px-4 text-[#9ca3af] font-medium">Active</th>
                    <th className="text-right py-3 px-4 text-[#9ca3af] font-medium">Revenue ($)</th>
                    <th className="text-center py-3 px-4 text-[#9ca3af] font-medium">Status</th>
                    <th className="text-center py-3 px-4 text-[#9ca3af] font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAffiliates.map((aff) => (
                    <tr key={aff.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4 text-zinc-200">{aff.name}</td>
                      <td className="py-3 px-4 text-[#9ca3af]">{aff.email}</td>
                      <td className="py-3 px-4 font-mono text-sm text-zinc-200">{aff.referralCode}</td>
                      <td className="text-right py-3 px-4 text-zinc-200">{aff.totalReferrals}</td>
                      <td className="text-right py-3 px-4 text-emerald-300">{aff.activeReferrals}</td>
                      <td className="text-right py-3 px-4 text-purple-300">
                        ${(aff.totalRevenue || 0).toFixed(2)}
                      </td>
                      <td className="text-center py-3 px-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            aff.isActive
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-white/5 text-[#9ca3af]'
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
                            className="p-1.5 text-[#3b82f6] hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleAffiliateStatus(aff.id, aff.isActive)}
                            className={`p-1.5 text-sm rounded transition-colors ${
                              aff.isActive
                                ? 'text-red-300 hover:text-red-200 hover:bg-red-500/10'
                                : 'text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/10'
                            }`}
                            title={aff.isActive ? 'Deactivate' : 'Activate'}
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
          </CardContent>
        </Card>
      )}

      {/* Payout Requests Tab */}
      {activeTab === 'payouts' && (
        <Card className="border-0 bg-surface">
          <CardHeader>
            <CardTitle className="text-zinc-200">Payout Requests</CardTitle>
            <CardDescription>Review and process affiliate payout requests</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left py-3 px-4 text-[#9ca3af] font-medium">Affiliate</th>
                    <th className="text-right py-3 px-4 text-[#9ca3af] font-medium">Amount</th>
                    <th className="text-center py-3 px-4 text-[#9ca3af] font-medium">Status</th>
                    <th className="text-left py-3 px-4 text-[#9ca3af] font-medium">Requested</th>
                    <th className="text-center py-3 px-4 text-[#9ca3af] font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutRequests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-[#9ca3af]">
                        No payout requests
                      </td>
                    </tr>
                  ) : (
                    payoutRequests.map((payout) => (
                      <tr key={payout.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-3 px-4 text-zinc-200">{payout.affiliateName}</td>
                        <td className="text-right py-3 px-4 text-zinc-200 font-semibold">
                          ${payout.amount.toFixed(2)}
                        </td>
                        <td className="text-center py-3 px-4">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              payout.status === 'PENDING'
                                ? 'bg-yellow-500/20 text-yellow-300'
                                : payout.status === 'APPROVED' || payout.status === 'PAID'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-red-500/20 text-red-300'
                            }`}
                          >
                            {payout.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[#9ca3af] text-sm">
                          {new Date(payout.requestedAt).toLocaleDateString()}
                        </td>
                        <td className="text-center py-3 px-4">
                          {payout.status === 'PENDING' ? (
                            <div className="flex gap-2 justify-center">
                              <button
                                onClick={() => handlePayoutAction(payout.id, 'APPROVE')}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Approve
                              </button>
                              <button
                                onClick={() => handlePayoutAction(payout.id, 'REJECT')}
                                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors flex items-center gap-1"
                              >
                                <XCircle className="w-3 h-3" />
                                Reject
                              </button>
                            </div>
                          ) : payout.status === 'APPROVED' ? (
                            <button
                              onClick={() => handlePayoutAction(payout.id, 'PAY')}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                            >
                              Mark as Paid
                            </button>
                          ) : (
                            <span className="text-xs text-[#9ca3af]">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Affiliate Details Modal */}
      {selectedAffiliate && affiliateDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="rounded-xl border border-white/5 bg-surface p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-zinc-200">Affiliate Details</h2>
              <button
                onClick={() => {
                  setSelectedAffiliate(null);
                  setAffiliateDetails(null);
                }}
                className="text-[#9ca3af] hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-xl border border-white/5 bg-white/5 p-4">
                <div className="text-[#9ca3af] text-sm mb-1">Total Referrals</div>
                <div className="text-2xl font-semibold text-zinc-200">{affiliateDetails.stats.totalReferrals}</div>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/5 p-4">
                <div className="text-[#9ca3af] text-sm mb-1">Active Referrals</div>
                <div className="text-2xl font-semibold text-emerald-300">
                  {affiliateDetails.stats.activeReferrals}
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/5 p-4">
                <div className="text-[#9ca3af] text-sm mb-1">Total Revenue</div>
                <div className="text-2xl font-semibold text-purple-300">
                  ${(affiliateDetails.stats.totalRevenue || 0).toFixed(2)}
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/5 p-4">
                <div className="text-[#9ca3af] text-sm mb-1">Conversion Rate</div>
                <div className="text-2xl font-semibold text-zinc-200">
                  {(affiliateDetails.stats.conversionRate || 0).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Referrals Table */}
            <div>
              <h3 className="text-xl font-semibold text-zinc-200 mb-4">Referrals</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left py-2 px-3 text-[#9ca3af] text-sm">User</th>
                      <th className="text-left py-2 px-3 text-[#9ca3af] text-sm">Signup</th>
                      <th className="text-right py-2 px-3 text-[#9ca3af] text-sm">Deposits</th>
                      <th className="text-right py-2 px-3 text-[#9ca3af] text-sm">Amount ($)</th>
                      <th className="text-right py-2 px-3 text-[#9ca3af] text-sm">Revenue ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {affiliateDetails.referrals.slice(0, 10).map((ref: any) => (
                      <tr key={ref.userId} className="border-b border-white/5">
                        <td className="py-2 px-3 text-sm text-zinc-200">{ref.username || 'Unknown'}</td>
                        <td className="py-2 px-3 text-sm text-[#9ca3af]">
                          {new Date(ref.signupDate).toLocaleDateString()}
                        </td>
                        <td className="text-right py-2 px-3 text-sm text-zinc-200">{ref.depositCount || 0}</td>
                        <td className="text-right py-2 px-3 text-sm text-zinc-200">
                          ${(ref.totalDepositAmount || 0).toFixed(2)}
                        </td>
                        <td className="text-right py-2 px-3 text-sm text-purple-300">
                          ${(ref.totalRevenue || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

