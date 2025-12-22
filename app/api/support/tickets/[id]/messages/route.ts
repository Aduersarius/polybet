/**
 * Support Ticket Messages API
 * GET /api/support/tickets/[id]/messages - Get ticket messages
 * POST /api/support/tickets/[id]/messages - Add message to ticket
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ticketService } from '@/lib/support/ticket-service';
import { canViewTicket, canSendMessage, sanitizeInput } from '@/lib/support/permissions';
import { telegramNotificationService } from '@/lib/telegram/notification-service';
import type { CreateMessageInput } from '@/lib/support/types';

/**
 * GET /api/support/tickets/[id]/messages
 * Get all messages for a ticket
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

    // Get messages (exclude internal messages for non-agents)
    const isAgent = user.supportRole === 'agent' || user.supportRole === 'admin' || user.isAdmin;

    const messages = await prisma.supportMessage.findMany({
      where: {
        ticketId,
        ...(isAgent ? {} : { isInternal: false }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
          },
        },
        attachments: {
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
            url: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/support/tickets/[id]/messages
 * Add a new message to the ticket
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
    const hasPermission = await canSendMessage(user, ticketId);
    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Validate message content
    if (!body.content || body.content.trim().length === 0) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    if (body.content.trim().length > 10000) {
      return NextResponse.json(
        { error: 'Message content too long (max 10,000 characters)' },
        { status: 400 }
      );
    }

    // Determine message source
    const isAgent = user.supportRole === 'agent' || user.supportRole === 'admin' || user.isAdmin;
    const source = isAgent ? 'agent' : 'web';

    // Create message
    const messageInput: CreateMessageInput = {
      ticketId,
      userId: user.id,
      content: sanitizeInput(body.content.trim()),
      isInternal: body.isInternal === true && isAgent, // Only agents can create internal messages
      source,
      telegramMessageId: body.telegramMessageId,
    };

    await ticketService.addMessage(messageInput);

    // Fetch updated messages
    const isAgentUser = user.supportRole === 'agent' || user.supportRole === 'admin' || user.isAdmin;

    const messages = await prisma.supportMessage.findMany({
      where: {
        ticketId,
        ...(isAgentUser ? {} : { isInternal: false }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
          },
        },
        attachments: {
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
            url: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const newMessage = messages[messages.length - 1];

    // Send Telegram notification if message is from agent (two-way sync)
    if (isAgent && !messageInput.isInternal) {
      // Send notification asynchronously (don't block response)
      telegramNotificationService
        .notifyTicketReply(ticketId, messageInput.content, user.name || user.username || 'Support Agent')
        .catch((error) => {
          console.error('Failed to send Telegram notification:', error);
        });
    }

    return NextResponse.json(newMessage, { status: 201 });
  } catch (error) {
    console.error('Error adding message:', error);

    if (error instanceof Error && error.message.includes('Rate limit')) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add message' },
      { status: 500 }
    );
  }
}
