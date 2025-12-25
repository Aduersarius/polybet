/**
 * Support Ticket Internal Notes API (Agents Only)
 * GET /api/support/tickets/[id]/notes - Get internal notes
 * POST /api/support/tickets/[id]/notes - Add internal note
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ticketService } from '@/lib/support/ticket-service';
import { canViewTicket, canViewInternalNotes, canAddInternalNote, sanitizeInput } from '@/lib/support/permissions';
import type { CreateNoteInput } from '@/lib/support/types';

/**
 * GET /api/support/tickets/[id]/notes
 * Get all internal notes for a ticket (agents only)
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
    const hasViewPermission = await canViewTicket(user, ticketId);
    if (!hasViewPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const hasNotesPermission = canViewInternalNotes(user);
    if (!hasNotesPermission) {
      return NextResponse.json(
        { error: 'Only support agents can view internal notes' },
        { status: 403 }
      );
    }

    // Get notes
    const notes = await prisma.supportNote.findMany({
      where: { ticketId },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(notes);
  } catch (error) {
    console.error('Error fetching notes:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch notes' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/support/tickets/[id]/notes
 * Add an internal note to the ticket (agents only)
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

    const hasAddPermission = canAddInternalNote(user);
    if (!hasAddPermission) {
      return NextResponse.json(
        { error: 'Only support agents can add internal notes' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate note content
    if (!body.content || body.content.trim().length === 0) {
      return NextResponse.json({ error: 'Note content is required' }, { status: 400 });
    }

    if (body.content.trim().length > 10000) {
      return NextResponse.json(
        { error: 'Note content too long (max 10,000 characters)' },
        { status: 400 }
      );
    }

    // Create note
    const noteInput: CreateNoteInput = {
      ticketId,
      agentId: user.id,
      content: sanitizeInput(body.content.trim()),
    };

    await ticketService.addNote(noteInput);

    // Fetch updated notes
    const notes = await prisma.supportNote.findMany({
      where: { ticketId },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const newNote = notes[notes.length - 1];

    return NextResponse.json(newNote, { status: 201 });
  } catch (error) {
    console.error('Error adding note:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add note' },
      { status: 500 }
    );
  }
}

