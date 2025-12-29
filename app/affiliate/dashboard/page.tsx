'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface TimeSeriesData {
  date: string;
  referrals: number;
  registrations: number;
  income: number;
  firstDeposits: number;
  amountDeposits: number;
}

interface Stats {
  totalReferrals: number;
  activeReferrals: number;
  totalDeposits: number;
  conversionRate: number;
  timeSeriesData?: TimeSeriesData[];
  affiliateName: string;
  affiliateEmail: string;
  affiliateCode: string;
}

export default function AffiliateDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeframe, setTimeframe] = useState<'all' | 'month' | 'week' | 'today'>('all');

  useEffect(() => {
    fetchStats();
  }, [timeframe]);

  const fetchStats = async () => {
    try {
      const response = await fetch(
        `/api/affiliate/dashboard/stats?timeframe=${timeframe}&timeSeries=true`,
        {
          credentials: 'include',
        }
      );

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
      <div className="space-y-6">
        <Card className="border-0 bg-surface">
          <CardHeader>
            <CardTitle className="text-zinc-200">Dashboard</CardTitle>
            <CardDescription>Loading dashboard metrics…</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-24 rounded-lg bg-white/5 animate-pulse" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
        {error}
      </div>
    );
  }

  // Format data for chart
  const chartData = stats?.timeSeriesData?.map((item) => ({
    date: format(parseISO(item.date), 'dd/MM'),
    fullDate: item.date,
    referrals: item.referrals,
    registrations: item.registrations,
    income: item.income,
    firstDeposits: item.firstDeposits,
    amountDeposits: item.amountDeposits,
  })) || [];

  // Calculate summary statistics
  const totalIncome = stats?.timeSeriesData?.reduce((sum, item) => sum + item.income, 0) || 0;
  const totalTransitions = stats?.totalReferrals || 0;
  const totalRegistrations = stats?.totalReferrals || 0;
  const ratioOnRegistrations = stats?.conversionRate || 0;
  const activeReferrals = stats?.activeReferrals || 0;
  const avgPlayerIncome = activeReferrals > 0 ? totalIncome / activeReferrals : 0;
  const firstDeposits = activeReferrals;
  const numberDeposits = stats?.totalDeposits || 0;
  const ratioOnDeposits = activeReferrals > 0 ? (numberDeposits / activeReferrals) * 100 : 0;
  const amountDeposit = stats?.timeSeriesData?.reduce((sum, item) => sum + item.amountDeposits, 0) || 0;
  const costTransition = 0; // Not tracked yet

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1f2937] border border-white/5 rounded-lg p-3 shadow-xl">
          <p className="text-zinc-200 font-semibold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm text-zinc-300" style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Overall Income */}
      <div className="flex justify-end">
        <div className="text-right">
          <div className="text-sm text-[#9ca3af] mb-1">Income</div>
          <div className="text-2xl font-semibold text-emerald-300">{totalIncome.toFixed(2)} $</div>
        </div>
      </div>

      {/* Timeframe Selector */}
      <Card className="border-0 bg-surface">
        <CardContent className="pt-6">
          <div className="flex space-x-1 border-b border-white/5">
            {(['all', 'month', 'week', 'today'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  timeframe === tf
                    ? 'border-b-2 border-[#8b5cf6] text-[#8b5cf6]'
                    : 'text-[#9ca3af] hover:text-zinc-200'
                }`}
              >
                {tf === 'all' ? 'For all time' : tf.charAt(0).toUpperCase() + tf.slice(1)}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Graph Section */}
      <Card className="border-0 bg-surface">
        <CardHeader>
          <CardTitle className="text-zinc-200">Performance Overview</CardTitle>
          <CardDescription>Track your referral performance over time</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis
                  dataKey="date"
                  stroke="#9ca3af"
                  style={{ fontSize: '12px' }}
                />
                <YAxis
                  yAxisId="left"
                  stroke="#9ca3af"
                  style={{ fontSize: '12px' }}
                  label={{ value: 'Count', angle: -90, position: 'insideLeft', style: { fill: '#9ca3af' } }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#9ca3af"
                  style={{ fontSize: '12px' }}
                  label={{ value: '$', angle: 90, position: 'insideRight', style: { fill: '#9ca3af' } }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ paddingTop: '20px', color: '#9ca3af' }}
                  iconType="circle"
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="referrals"
                  stroke="#000000"
                  strokeWidth={2}
                  dot={false}
                  name="Referrals"
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="registrations"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  name="Registrations"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="income"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="Income"
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="firstDeposits"
                  stroke="#eab308"
                  strokeWidth={2}
                  dot={false}
                  name="First Deposits"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="amountDeposits"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={false}
                  name="Amount of deposits"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-96 flex items-center justify-center text-[#9ca3af]">
              No data available for the selected timeframe
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics Table */}
      <Card className="border-0 bg-surface">
        <CardHeader>
          <CardTitle className="text-zinc-200">Statistics</CardTitle>
          <CardDescription>Detailed performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              <div>
                <div className="text-sm text-[#9ca3af] mb-1">Transition</div>
                <div className="text-lg font-semibold text-zinc-200">{totalTransitions}</div>
              </div>
              <div>
                <div className="text-sm text-[#9ca3af] mb-1">Registration</div>
                <div className="text-lg font-semibold text-zinc-200">{totalRegistrations}</div>
              </div>
              <div>
                <div className="text-sm text-[#9ca3af] mb-1">Ratio on registrations</div>
                <div className="text-lg font-semibold text-zinc-200">{ratioOnRegistrations.toFixed(2)}%</div>
              </div>
            </div>

            {/* Middle Column */}
            <div className="space-y-4">
              <div>
                <div className="text-sm text-[#9ca3af] mb-1">Average player income</div>
                <div className="text-lg font-semibold text-zinc-200">{avgPlayerIncome.toFixed(2)} $</div>
              </div>
              <div>
                <div className="text-sm text-[#9ca3af] mb-1">First Deposits</div>
                <div className="text-lg font-semibold text-zinc-200">{firstDeposits}</div>
              </div>
              <div>
                <div className="text-sm text-[#9ca3af] mb-1">Number deposits</div>
                <div className="text-lg font-semibold text-zinc-200">{numberDeposits}</div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              <div>
                <div className="text-sm text-[#9ca3af] mb-1">Ratio on deposits</div>
                <div className="text-lg font-semibold text-zinc-200">{ratioOnDeposits.toFixed(2)}%</div>
              </div>
              <div>
                <div className="text-sm text-[#9ca3af] mb-1">Amount deposit</div>
                <div className="text-lg font-semibold text-zinc-200">{amountDeposit.toFixed(2)} $</div>
              </div>
              <div>
                <div className="text-sm text-[#9ca3af] mb-1">Cost transition</div>
                <div className="text-lg font-semibold text-zinc-200">{costTransition.toFixed(2)} $</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
