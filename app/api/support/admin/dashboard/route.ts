/**
 * Support Admin Dashboard API
 * GET /api/support/admin/dashboard - Get dashboard statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ticketService } from '@/lib/support/ticket-service';
import { canViewDashboard } from '@/lib/support/permissions';

/**
 * GET /api/support/admin/dashboard
 * Get support dashboard statistics (agents and admins only)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;

    // Check permissions
    if (!canViewDashboard(user)) {
      return NextResponse.json(
        { error: 'Only support agents and admins can view the dashboard' },
        { status: 403 }
      );
    }

    // Get dashboard statistics
    const stats = await ticketService.getDashboardStats();

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
