'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Stats {
  totalReferrals: number;
  activeReferrals: number;
  totalDeposits: number;
  conversionRate: number;
  monthlyStats: Array<{
    month: string;
    referrals: number;
    deposits: number;
  }>;
}

export default function AffiliateDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/affiliate/dashboard/stats', {
        credentials: 'include',
      });

      if (response.status === 401) {
        router.push('/affiliate/login');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }

      const data = await response.json();
      setStats(data);
    } catch (err: any) {
      console.error('Error fetching stats:', err);
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a] flex items-center justify-center p-4">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a] text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
              Affiliate Dashboard
            </h1>
            <Link
              href="/"
              className="text-gray-400 hover:text-white transition-colors"
            >
              ← Back to main site
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-xl p-6">
            <div className="text-gray-400 text-sm mb-2">Total Referrals</div>
            <div className="text-3xl font-bold text-white">
              {stats?.totalReferrals || 0}
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-xl p-6">
            <div className="text-gray-400 text-sm mb-2">Active Referrals</div>
            <div className="text-3xl font-bold text-green-400">
              {stats?.activeReferrals || 0}
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-xl p-6">
            <div className="text-gray-400 text-sm mb-2">Total Deposits</div>
            <div className="text-3xl font-bold text-blue-400">
              {stats?.totalDeposits || 0}
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-xl p-6">
            <div className="text-gray-400 text-sm mb-2">Conversion Rate</div>
            <div className="text-3xl font-bold text-purple-400">
              {stats?.conversionRate.toFixed(1) || '0.0'}%
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Link
            href="/affiliate/dashboard/referrals"
            className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-xl p-6 hover:border-blue-500/50 transition-colors"
          >
            <h3 className="text-xl font-semibold mb-2">View Referrals</h3>
            <p className="text-gray-400 text-sm">See all users you've referred</p>
          </Link>

          <Link
            href="/affiliate/dashboard/links"
            className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-xl p-6 hover:border-blue-500/50 transition-colors"
          >
            <h3 className="text-xl font-semibold mb-2">Manage Links</h3>
            <p className="text-gray-400 text-sm">Create and manage promo codes</p>
          </Link>

          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-xl p-6">
            <h3 className="text-xl font-semibold mb-2">Monthly Stats</h3>
            <p className="text-gray-400 text-sm">Track your performance over time</p>
          </div>
        </div>

        {/* Monthly Stats Table */}
        {stats && stats.monthlyStats.length > 0 && (
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4">Monthly Performance</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-gray-400">Month</th>
                    <th className="text-right py-3 px-4 text-gray-400">Referrals</th>
                    <th className="text-right py-3 px-4 text-gray-400">Deposits</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.monthlyStats.map((month) => (
                    <tr key={month.month} className="border-b border-white/5">
                      <td className="py-3 px-4">{month.month}</td>
                      <td className="text-right py-3 px-4">{month.referrals}</td>
                      <td className="text-right py-3 px-4">{month.deposits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

