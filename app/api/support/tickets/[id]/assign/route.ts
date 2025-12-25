/**
 * Support Ticket Assignment API
 * POST /api/support/tickets/[id]/assign - Assign ticket to agent
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ticketService } from '@/lib/support/ticket-service';
import { canViewTicket, canAssignTicket } from '@/lib/support/permissions';

/**
 * POST /api/support/tickets/[id]/assign
 * Assign ticket to a support agent
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
    const hasViewPermission = await canViewTicket(user, ticketId);
    if (!hasViewPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const hasAssignPermission = canAssignTicket(user);
    if (!hasAssignPermission) {
      return NextResponse.json(
        { error: 'Only admins can assign tickets' },
        { status: 403 }
      );
    }

    const body = await request.json();

    if (!body.agentId) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 });
    }

    await ticketService.assignTicket(ticketId, body.agentId, user.id);

    // Fetch updated ticket
    const ticket = await ticketService.getTicketDetail(ticketId, true);

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('Error assigning ticket:', error);

    if (error instanceof Error) {
      if (error.message === 'Ticket not found') {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }
      if (error.message.includes('Invalid agent')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to assign ticket' },
      { status: 500 }
    );
  }
}

