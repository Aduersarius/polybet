'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Calendar } from 'lucide-react';
import { format, subDays } from 'date-fns';

interface Statistic {
  date: string;
  referrals: number;
  registrations: number;
  deposits: number;
  revenue: number;
  conversionRate: number;
}

interface StatisticsResponse {
  statistics: Statistic[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function AffiliateStatisticsPageContent() {
  const router = useRouter();
  const [data, setData] = useState<StatisticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    fetchStatistics();
  }, [page, groupBy, startDate, endDate]);

  const fetchStatistics = async () => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        groupBy,
        startDate,
        endDate,
      });

      const response = await fetch(`/api/affiliate/dashboard/statistics?${params}`, {
        credentials: 'include',
      });

      if (response.status === 401) {
        router.push('/affiliate/login');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch statistics');
      }

      const result = await response.json();
      setData(result);
    } catch (err: any) {
      console.error('Error fetching statistics:', err);
      setError(err.message || 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = async () => {
    try {
      const params = new URLSearchParams({
        groupBy,
        startDate,
        endDate,
        export: 'true',
      });

      const response = await fetch(`/api/affiliate/dashboard/statistics?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to export');
      }

      const result = await response.json();
      const exportData = result.exportData || [];

      // Convert to CSV
      const headers = Object.keys(exportData[0] || {});
      const csvRows = [
        headers.join(','),
        ...exportData.map((row: any) =>
          headers.map((header) => `"${row[header] || ''}"`).join(',')
        ),
      ];

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `affiliate-statistics-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Error exporting:', err);
      alert('Failed to export statistics');
    }
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
          <h1 className="text-2xl font-semibold text-zinc-200 mb-2">Statistics</h1>
          <p className="text-sm text-[#9ca3af]">Detailed performance reports and analytics</p>
        </div>
        <button
          onClick={exportToCSV}
          className="inline-flex items-center gap-2 rounded-lg bg-white text-black px-4 py-2 text-sm font-semibold hover:bg-gray-200 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-white/5 bg-surface p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Group By
            </label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as 'day' | 'week' | 'month')}
              className="w-full px-4 py-2 bg-white/5 border border-white/5 rounded-lg text-zinc-200 focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 bg-white/5 border border-white/5 rounded-lg text-zinc-200 focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 bg-white/5 border border-white/5 rounded-lg text-zinc-200 focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setStartDate(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
                setEndDate(format(new Date(), 'yyyy-MM-dd'));
              }}
              className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-colors flex items-center justify-center space-x-2 text-zinc-200"
            >
              <Calendar className="w-4 h-4" />
              <span>Last 30 Days</span>
            </button>
          </div>
        </div>
      </div>

      {/* Statistics Table */}
      {data && (
        <div className="rounded-xl border border-white/5 bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left py-4 px-6 text-[#9ca3af] font-medium">Date</th>
                  <th className="text-right py-4 px-6 text-[#9ca3af] font-medium">Referrals</th>
                  <th className="text-right py-4 px-6 text-[#9ca3af] font-medium">Registrations</th>
                  <th className="text-right py-4 px-6 text-[#9ca3af] font-medium">Deposits</th>
                  <th className="text-right py-4 px-6 text-[#9ca3af] font-medium">Conversion Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.statistics.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-[#9ca3af]">
                      No data available for the selected period
                    </td>
                  </tr>
                ) : (
                  data.statistics.map((stat, index) => (
                    <tr
                      key={index}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="py-4 px-6 text-zinc-200">
                        {groupBy === 'month'
                          ? format(new Date(stat.date + '-01'), 'MMM yyyy')
                          : format(new Date(stat.date), 'MMM dd, yyyy')}
                      </td>
                      <td className="text-right py-4 px-6 text-zinc-200">{stat.referrals}</td>
                      <td className="text-right py-4 px-6 text-zinc-200">{stat.registrations}</td>
                      <td className="text-right py-4 px-6 text-zinc-200">{stat.deposits}</td>
                      <td className="text-right py-4 px-6 text-zinc-200">
                        {stat.conversionRate.toFixed(2)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="border-t border-white/5 px-6 py-4 flex items-center justify-between">
              <div className="text-sm text-[#9ca3af]">
                Showing {((data.pagination.page - 1) * data.pagination.limit) + 1} to{' '}
                {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of{' '}
                {data.pagination.total} results
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={data.pagination.page === 1}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-zinc-200"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                  disabled={data.pagination.page === data.pagination.totalPages}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-zinc-200"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AffiliateStatisticsPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div className="rounded-xl border border-white/5 bg-surface p-6">
          <div className="h-24 rounded-lg bg-white/5 animate-pulse" />
        </div>
      </div>
    }>
      <AffiliateStatisticsPageContent />
    </Suspense>
  );
}
