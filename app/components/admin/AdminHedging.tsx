'use client';

import { useEffect, useState } from 'react';
import { Shield, TrendingUp, AlertTriangle, CheckCircle, XCircle, Clock, DollarSign, Target, Settings } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type HedgeDashboardData = {
  summary: {
    period: string;
    totalHedges: number;
    successfulHedges: number;
    failedHedges: number;
    pendingHedges: number;
    successRate: number;
    avgHedgeTimeMs: number;
    totalProfit: number;
    totalFees: number;
    totalSpreadCaptured: number;
    netProfitMargin: string;
  };
  exposure: {
    totalUnhedged: number;
    totalHedged: number;
    openPositions: number;
    recentFailures: number;
    netExposure: number;
  };
  config: {
    enabled: boolean;
    minSpreadBps: number;
    maxSlippageBps: number;
    maxUnhedgedExposure: number;
    maxPositionSize: number;
  };
  marketStats: Array<{
    marketId: string;
    eventId: string;
    hedgeCount: number;
    totalVolume: number;
    totalProfit: number;
  }>;
  recentFailures: Array<{
    id: string;
    orderId: string;
    marketId: string;
    reason: string;
    createdAt: string;
    amount: number;
    userPrice: number;
    hedgePrice: number;
  }>;
  systemHealth: {
    hedgingEnabled: boolean;
    polymarketConnected: boolean;
    unhedgedExposurePercent: number;
    recentFailureRate: number;
  };
};

const formatCurrency = (value: number) =>
  `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatNumber = (value: number) => value.toLocaleString();

export function AdminHedging() {
  const [data, setData] = useState<HedgeDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('24h');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadData();
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [period]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/hedge/dashboard?period=${period}`);
      if (!res.ok) throw new Error('Failed to load hedge dashboard');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (key: string, value: any) => {
    try {
      setUpdating(true);
      const res = await fetch('/api/hedge/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, updatedBy: 'admin' }),
      });

      if (!res.ok) throw new Error('Failed to update config');

      // Reload data
      await loadData();
      alert(`✅ Updated ${key} successfully`);
    } catch (err) {
      alert(`❌ Failed to update: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUpdating(false);
    }
  };

  const getHealthStatus = () => {
    if (!data) return { color: 'gray', text: 'Unknown', icon: Clock };

    const { systemHealth } = data;

    if (!systemHealth.hedgingEnabled) {
      return { color: 'yellow', text: 'Disabled', icon: AlertTriangle };
    }

    if (!systemHealth.polymarketConnected) {
      return { color: 'red', text: 'Disconnected', icon: XCircle };
    }

    if (systemHealth.recentFailureRate > 0.1) {
      return { color: 'orange', text: 'High Failure Rate', icon: AlertTriangle };
    }

    if (systemHealth.unhedgedExposurePercent > 80) {
      return { color: 'orange', text: 'High Exposure', icon: AlertTriangle };
    }

    return { color: 'green', text: 'Healthy', icon: CheckCircle };
  };

  const healthStatus = getHealthStatus();
  const HealthIcon = healthStatus.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-zinc-200">Hedging Dashboard</h2>
          <p className="text-muted-foreground mt-1">Monitor Polymarket hedging performance and risk</p>
        </div>
        <div className="flex gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-4 py-2 bg-background border border-white/5 rounded-lg text-zinc-200"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>
          <button
            onClick={loadData}
            disabled={loading}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && !data && (
        <Card className="border-0 bg-surface">
          <CardContent className="p-8">
            <div className="h-32 rounded-lg bg-white/5 animate-pulse" />
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* System Health Banner */}
          <div
            className={`rounded-xl border p-4 flex items-center gap-3 ${healthStatus.color === 'green'
              ? 'border-emerald-500/30 bg-emerald-500/10'
              : healthStatus.color === 'yellow'
                ? 'border-yellow-500/30 bg-yellow-500/10'
                : healthStatus.color === 'orange'
                  ? 'border-orange-500/30 bg-orange-500/10'
                  : 'border-red-500/30 bg-red-500/10'
              }`}
          >
            <HealthIcon className={`h-6 w-6 ${healthStatus.color === 'green' ? 'text-emerald-400' :
              healthStatus.color === 'yellow' ? 'text-yellow-400' :
                healthStatus.color === 'orange' ? 'text-orange-400' :
                  'text-red-400'
              }`} />
            <div className="flex-1">
              <div className="font-semibold text-zinc-200">System Status: {healthStatus.text}</div>
              <div className="text-sm text-muted-foreground">
                {!data.systemHealth.hedgingEnabled && 'Hedging is currently disabled'}
                {data.systemHealth.hedgingEnabled && !data.systemHealth.polymarketConnected &&
                  'Polymarket credentials not configured - check .env file'}
                {data.systemHealth.hedgingEnabled && data.systemHealth.polymarketConnected &&
                  data.systemHealth.recentFailureRate > 0.1 &&
                  `High failure rate: ${(data.systemHealth.recentFailureRate * 100).toFixed(1)}%`}
                {data.systemHealth.hedgingEnabled && data.systemHealth.polymarketConnected &&
                  data.systemHealth.recentFailureRate <= 0.1 &&
                  data.systemHealth.unhedgedExposurePercent > 80 &&
                  `High exposure: ${data.systemHealth.unhedgedExposurePercent.toFixed(1)}% of limit`}
                {healthStatus.text === 'Healthy' && 'All systems operational'}
              </div>
            </div>
            {!data.config.enabled && (
              <button
                onClick={() => updateConfig('enabled', true)}
                disabled={updating}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-50"
              >
                Enable Hedging
              </button>
            )}
            {data.config.enabled && (
              <button
                onClick={() => updateConfig('enabled', false)}
                disabled={updating}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm disabled:opacity-50"
              >
                Disable Hedging
              </button>
            )}
          </div>

          {/* Main Metrics */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: 'Success Rate',
                value: `${data.summary.successRate}%`,
                sub: `${data.summary.successfulHedges}/${data.summary.totalHedges} successful`,
                icon: <CheckCircle className="h-5 w-5 text-emerald-300" />,
                color: data.summary.successRate >= 95 ? 'emerald' : data.summary.successRate >= 80 ? 'yellow' : 'red',
              },
              {
                label: 'Net Profit',
                value: `$${Number(data.summary.totalProfit || 0).toFixed(3)}`,
                sub: `${data.summary.netProfitMargin}% margin`,
                icon: <DollarSign className="h-5 w-5 text-green-300" />,
                color: 'green',
              },
              {
                label: 'Unhedged Exposure',
                value: formatCurrency(data.exposure.totalUnhedged),
                sub: `${data.exposure.openPositions} open positions`,
                icon: <Target className="h-5 w-5 text-orange-300" />,
                color: data.systemHealth.unhedgedExposurePercent > 80 ? 'red' : 'orange',
              },
              {
                label: 'Avg Hedge Time',
                value: `${(data.summary.avgHedgeTimeMs / 1000).toFixed(2)}s`,
                sub: data.summary.avgHedgeTimeMs < 5000 ? 'Fast' : 'Slow',
                icon: <Clock className="h-5 w-5 text-blue-300" />,
                color: 'blue',
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-white/5 bg-surface p-5 shadow-lg shadow-black/30"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="mt-2 text-2xl font-bold text-zinc-200">{card.value}</p>
                    <p className="text-xs text-zinc-500">{card.sub}</p>
                  </div>
                  <div className="rounded-lg bg-white/5 p-2">{card.icon}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Detailed Stats */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Profit Breakdown */}
            <Card className="border-0 bg-surface">
              <CardHeader>
                <CardTitle className="text-zinc-200 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Profit Breakdown
                </CardTitle>
                <CardDescription>Revenue and costs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Spread Captured</span>
                  <span className="text-zinc-200 font-semibold">${Number(data.summary.totalSpreadCaptured || 0).toFixed(3)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Polymarket Fees</span>
                  <span className="text-red-400">-${Number(data.summary.totalFees || 0).toFixed(3)}</span>
                </div>
                <div className="h-px bg-white/5" />
                <div className="flex justify-between items-center">
                  <span className="text-zinc-200 font-semibold">Net Profit</span>
                  <span className={`font-bold ${data.summary.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    ${Number(data.summary.totalProfit || 0).toFixed(3)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Configuration */}
            <Card className="border-0 bg-surface">
              <CardHeader>
                <CardTitle className="text-zinc-200 flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Configuration
                </CardTitle>
                <CardDescription>Current settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Hedging Status</span>
                  <span className={`font-semibold ${data.config.enabled ? 'text-emerald-400' : 'text-red-400'}`}>
                    {data.config.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Min Spread</span>
                  <span className="text-zinc-200">{(data.config.minSpreadBps / 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Max Slippage</span>
                  <span className="text-zinc-200">{(data.config.maxSlippageBps / 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Max Position</span>
                  <span className="text-zinc-200">{formatCurrency(data.config.maxPositionSize)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Max Exposure</span>
                  <span className="text-zinc-200">{formatCurrency(data.config.maxUnhedgedExposure)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Markets */}
          {data.marketStats.length > 0 && (
            <Card className="border-0 bg-surface">
              <CardHeader>
                <CardTitle className="text-zinc-200">Top Markets by Volume</CardTitle>
                <CardDescription>Most hedged markets in this period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.marketStats.slice(0, 5).map((market, idx) => (
                    <div
                      key={market.marketId}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-muted-foreground font-mono text-sm">#{idx + 1}</div>
                        <div>
                          <div className="text-zinc-200 font-medium">{market.eventId.slice(0, 24)}...</div>
                          <div className="text-xs text-muted-foreground">{market.hedgeCount} hedges</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-zinc-200 font-semibold">{formatCurrency(market.totalVolume)}</div>
                        <div className={`text-xs ${market.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatCurrency(market.totalProfit)} profit
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Failures */}
          {data.recentFailures.length > 0 && (
            <Card className="border-0 bg-surface">
              <CardHeader>
                <CardTitle className="text-zinc-200 flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-400" />
                  Recent Failures
                </CardTitle>
                <CardDescription>Debug failed hedges</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.recentFailures.map((failure) => (
                    <div
                      key={failure.id}
                      className="p-3 rounded-lg bg-red-500/10 border border-red-500/20"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="text-red-400 font-medium text-sm">{failure.reason}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Order: {failure.orderId.slice(0, 8)}... |
                            Amount: {formatCurrency(failure.amount)} |
                            {new Date(failure.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Setup Instructions (if not connected) */}
          {!data.systemHealth.polymarketConnected && (
            <Card className="border-0 bg-surface">
              <CardHeader>
                <CardTitle className="text-zinc-200 flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Setup Required
                </CardTitle>
                <CardDescription>Configure Polymarket credentials to enable hedging</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-zinc-300">
                  <p className="mb-2">To enable automated hedging, you need to:</p>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                    <li>Contact Polymarket team for API trading access</li>
                    <li>Set up a proxy wallet and fund it with USDC</li>
                    <li>Add credentials to your .env file:
                      <pre className="mt-2 p-2 bg-black/50 rounded text-xs overflow-x-auto">
                        {`POLYMARKET_CLOB_API_URL=https://clob.polymarket.com
POLYMARKET_API_KEY=your_key_here
POLYMARKET_PRIVATE_KEY=your_private_key_here
POLYMARKET_CHAIN_ID=137`}
                      </pre>
                    </li>
                    <li>Restart your server</li>
                    <li>Run: <code className="bg-black/50 px-1 rounded">npx tsx scripts/init-hedging.ts</code></li>
                  </ol>
                </div>
                <a
                  href="/HEDGING_SETUP.md"
                  target="_blank"
                  className="inline-block px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm"
                >
                  View Full Setup Guide
                </a>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

