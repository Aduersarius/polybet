/**
 * Support Ticket Close API
 * POST /api/support/tickets/[id]/close - Close ticket with resolution
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ticketService } from '@/lib/support/ticket-service';
import { canCloseTicket, sanitizeInput } from '@/lib/support/permissions';

/**
 * POST /api/support/tickets/[id]/close
 * Close a ticket with resolution notes
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;
    const { id: ticketId } = await params;

    // Check permissions
    const hasPermission = await canCloseTicket(user, ticketId);
    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Validate resolution
    if (!body.resolution || body.resolution.trim().length === 0) {
      return NextResponse.json({ error: 'Resolution notes are required' }, { status: 400 });
    }

    const resolution = sanitizeInput(body.resolution.trim());

    await ticketService.closeTicket(ticketId, resolution, user.id);

    // Fetch updated ticket
    const isAgent = user.supportRole === 'agent' || user.supportRole === 'admin' || user.supportRole === 'support_manager' || user.isAdmin;
    const ticket = await ticketService.getTicketDetail(ticketId, isAgent);

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('Error closing ticket:', error);

    if (error instanceof Error && error.message === 'Ticket not found') {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to close ticket' },
      { status: 500 }
    );
  }
}
