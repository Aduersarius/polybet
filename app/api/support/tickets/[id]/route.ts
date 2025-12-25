/**
 * Support Ticket Detail API
 * GET /api/support/tickets/[id] - Get ticket detail
 * PATCH /api/support/tickets/[id] - Update ticket
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ticketService } from '@/lib/support/ticket-service';
import { telegramNotificationService } from '@/lib/telegram/notification-service';
import {
  canViewTicket,
  canUpdateTicket,
  canViewInternalNotes,
  isValidStatus,
  isValidPriority,
} from '@/lib/support/permissions';
import type { UpdateTicketInput } from '@/lib/support/types';

/**
 * GET /api/support/tickets/[id]
 * Get ticket detail with messages and attachments
 */
export async function GET(
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
    const hasPermission = await canViewTicket(user, ticketId);
    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Include internal notes only for agents/admins
    const includeNotes = canViewInternalNotes(user);

    const ticket = await ticketService.getTicketDetail(ticketId, includeNotes, user.id);

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('Error fetching ticket:', error);

    if (error instanceof Error && error.message === 'Ticket not found') {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch ticket' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/support/tickets/[id]
 * Update ticket (status, priority, assignment)
 */
export async function PATCH(
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

    const hasUpdatePermission = canUpdateTicket(user);
    if (!hasUpdatePermission) {
      return NextResponse.json(
        { error: 'Only support agents and admins can update tickets' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const updates: UpdateTicketInput = {};

    // Get current ticket for comparison
    const currentTicket = await ticketService.getTicketDetail(ticketId, user.id);
    if (!currentTicket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Validate and apply status update
    if (body.status) {
      if (!isValidStatus(body.status)) {
        return NextResponse.json(
          { error: 'Invalid status. Must be one of: open, pending, resolved, closed' },
          { status: 400 }
        );
      }
      updates.status = body.status;
    }

    // Validate and apply priority update
    if (body.priority) {
      if (!isValidPriority(body.priority)) {
        return NextResponse.json(
          { error: 'Invalid priority. Must be one of: low, medium, high, critical' },
          { status: 400 }
        );
      }
      updates.priority = body.priority;
    }

    // Apply assignment update (only admins can assign)
    if ('assignedToId' in body) {
      if (!user.isAdmin && user.supportRole !== 'admin') {
        return NextResponse.json(
          { error: 'Only admins can assign tickets' },
          { status: 403 }
        );
      }
      updates.assignedToId = body.assignedToId;
    }

    await ticketService.updateTicket(ticketId, updates, user.id);

    // Send Telegram notification if status changed
    if (updates.status && updates.status !== currentTicket.status) {
      telegramNotificationService
        .notifyStatusChange(ticketId, currentTicket.status, updates.status)
        .catch((error) => {
          console.error('Failed to send Telegram status notification:', error);
        });
    }

    // Send Telegram notification if ticket was assigned
    if (updates.assignedToId && updates.assignedToId !== currentTicket.assignedTo?.id) {
      const agentName = user.name || user.username || 'Support Agent';
      telegramNotificationService
        .notifyAssignment(ticketId, agentName)
        .catch((error) => {
          console.error('Failed to send Telegram assignment notification:', error);
        });
    }

    // Fetch updated ticket
    const includeNotes = canViewInternalNotes(user);
    const ticket = await ticketService.getTicketDetail(ticketId, includeNotes, user.id);

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('Error updating ticket:', error);

    if (error instanceof Error && error.message === 'Ticket not found') {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update ticket' },
      { status: 500 }
    );
  }
}


