'use client';

import { useState, useEffect } from 'react';
import { Headphones, TrendingUp, Clock, Users, AlertCircle, CheckCircle, MessageSquare } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { TicketInbox } from '@/app/components/admin/support/TicketInbox';
import { TicketFilters } from '@/app/components/admin/support/TicketFilters';
import { AdminTicketDetail } from '@/app/components/admin/support/AdminTicketDetail';

interface DashboardStats {
  openTickets: number;
  pendingTickets: number;
  resolvedToday: number;
  avgFirstResponseTime: number;
  avgResolutionTime: number;
  ticketsToday: number;
  ticketsByStatus: Record<string, number>;
  ticketsByPriority: Record<string, number>;
  agentWorkload: Array<{
    agentId: string;
    name: string;
    username: string | null;
    activeTickets: number;
  }>;
}

export default function AdminSupportPage() {
  const { data: session, isPending } = useSession() as { data: any; isPending: boolean };
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [filters, setFilters] = useState({
    status: [] as string[],
    priority: [] as string[],
    category: [] as string[],
    assignedTo: '',
    search: '',
  });

  // Check auth and permissions
  useEffect(() => {
    if (!isPending && !session) {
      router.push('/');
      return;
    }

    if (!isPending && session?.user) {
      const user = session.user as any;
      if (!user.isAdmin && user.supportRole !== 'agent' && user.supportRole !== 'admin' && user.supportRole !== 'support_manager') {
        router.push('/');
      }
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (session) {
      fetchDashboardStats();
      fetchAgents();
    }
  }, [session, refreshTrigger]);

  const fetchDashboardStats = async () => {
    try {
      const response = await fetch('/api/support/admin/dashboard');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
    }
  };

  const fetchAgents = async () => {
    try {
      const response = await fetch('/api/support/admin/agents');
      if (response.ok) {
        const data = await response.json();
        setAgents(data);
      }
    } catch (error) {
      console.error('Failed to fetch agents:', error);
    }
  };

  const handleTicketClick = (ticketId: string) => {
    setSelectedTicketId(ticketId);
  };

  const handleCloseDetail = () => {
    setSelectedTicketId(null);
    setRefreshTrigger((prev) => prev + 1);
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-[3px] border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  const user = session?.user as any;

  return (
    <div className="min-h-screen bg-transparent text-zinc-200 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-3 rounded-xl bg-surface-elevated border border-emerald-500/20">
            <Headphones className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Support Dashboard</h1>
            <p className="text-muted-foreground">Manage support tickets and customer requests</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Open Tickets */}
          <div className="p-5 rounded-xl bg-surface-elevated border border-emerald-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <AlertCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-sm font-medium text-zinc-300">Open Tickets</h3>
            </div>
            <p className="text-3xl font-bold text-emerald-400">{stats.openTickets}</p>
            {stats.pendingTickets > 0 && (
              <p className="text-xs text-yellow-400 mt-1">{stats.pendingTickets} pending</p>
            )}
          </div>

          {/* Today's Tickets */}
          <div className="p-5 rounded-xl bg-white/5 border border-white/5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-primary/20">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-sm font-medium text-zinc-300">Today</h3>
            </div>
            <p className="text-3xl font-bold text-primary">{stats.ticketsToday}</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.resolvedToday} resolved</p>
          </div>

          {/* Avg Response Time */}
          <div className="p-5 rounded-xl bg-white/5 border border-white/5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Clock className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-sm font-medium text-zinc-300">Avg Response</h3>
            </div>
            <p className="text-3xl font-bold text-purple-400">{stats.avgFirstResponseTime}m</p>
            <p className="text-xs text-muted-foreground mt-1">First response time</p>
          </div>

          {/* Avg Resolution Time */}
          <div className="p-5 rounded-xl bg-white/5 border border-white/5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-orange-500/20">
                <CheckCircle className="w-5 h-5 text-orange-400" />
              </div>
              <h3 className="text-sm font-medium text-zinc-300">Avg Resolution</h3>
            </div>
            <p className="text-3xl font-bold text-orange-400">{stats.avgResolutionTime}h</p>
            <p className="text-xs text-muted-foreground mt-1">Time to resolve</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 p-6 rounded-xl bg-white/5 border border-white/5">
        <TicketFilters filters={filters} onFilterChange={setFilters} agents={agents} />
      </div>

      {/* Ticket Inbox */}
      <div className="p-6 rounded-xl bg-white/5 border border-white/5">
        <div className="flex items-center gap-2 mb-6">
          <MessageSquare className="w-5 h-5 text-emerald-400" />
          <h2 className="text-xl font-bold">Ticket Inbox</h2>
        </div>
        <TicketInbox
          filters={filters}
          onTicketClick={handleTicketClick}
          refreshTrigger={refreshTrigger}
          currentUserId={user?.id}
        />
      </div>

      {/* Ticket Detail Modal */}
      {selectedTicketId && (
        <AdminTicketDetail
          ticketId={selectedTicketId}
          onClose={handleCloseDetail}
          agents={agents}
          currentUserId={user?.id || ''}
          currentUserName={user?.name || user?.username || null}
        />
      )}
    </div>
  );
}
