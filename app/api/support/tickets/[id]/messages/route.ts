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
    const isAgent = user.supportRole === 'agent' || user.supportRole === 'admin' || user.supportRole === 'support_manager' || user.isAdmin;

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
    const isAgent = user.supportRole === 'agent' || user.supportRole === 'admin' || user.supportRole === 'support_manager' || user.isAdmin;
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

    // Get ticket to find the user ID for WebSocket notification
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { userId: true, subject: true },
    });

    // Create notification if message is from agent to a different user's ticket
    // (No notification if agent is replying to their own ticket - ticket.userId === user.id)
    if (isAgent && !messageInput.isInternal && ticket?.userId && ticket.userId !== user.id) {
      // Create notification asynchronously (don't block response, but log success/failure)
      (async () => {
        try {
          const notification = await prisma.notification.create({
            data: {
              userId: ticket.userId,
              type: 'SUPPORT_REPLY',
              message: `Support replied to your ticket: ${ticket.subject}`,
              resourceId: ticketId,
            },
          });
          console.log('✅ Support notification created:', {
            notificationId: notification.id,
            userId: ticket.userId,
            ticketId,
            ticketSubject: ticket.subject,
          });
        } catch (error) {
          console.error('❌ Failed to create support notification:', error);
          console.error('Error details:', {
            userId: ticket.userId,
            type: 'SUPPORT_REPLY',
            ticketId,
            ticketSubject: ticket.subject,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
      })();
    } else {
      // Log why notification was not created (for debugging)
      console.log('ℹ️ Notification not created:', {
        isAgent,
        isInternal: messageInput.isInternal,
        hasTicketUserId: !!ticket?.userId,
        ticketUserId: ticket?.userId,
        currentUserId: user.id,
        reason: !isAgent ? 'not_agent' :
          messageInput.isInternal ? 'internal_message' :
            !ticket?.userId ? 'no_ticket_user' :
              ticket.userId === user.id ? 'same_user' : 'unknown',
      });
    }

    // Publish to Redis for WebSocket broadcasting (non-blocking)
    if (ticket?.userId) {
      const payload = {
        ticketId,
        messageId: newMessage.id,
        content: newMessage.content,
        source: newMessage.source,
        createdAt: newMessage.createdAt,
        userId: newMessage.user.id,
        username: newMessage.user.username || newMessage.user.name,
      };

      const { redis } = await import('@/lib/redis');
      if (redis) {
        redis.publish('user-updates', JSON.stringify({
          userId: ticket.userId,
          type: 'SUPPORT_MESSAGE',
          payload
        })).catch((err) => {
          console.error('Redis publish failed:', err);
        });
      }

      // Also publish to Pusher (Soketi) for Frontend
      try {
        const { triggerUserUpdate } = await import('@/lib/pusher-server');
        // We use 'user-update' as the generic event name on the private channel
        // or just use the type as the event name.
        // SupportChatWidget.tsx uses channel.bind('SUPPORT_MESSAGE', ...)
        await triggerUserUpdate(ticket.userId, 'SUPPORT_MESSAGE', payload);
        console.log(`✅ [API] Support message published to Pusher for user ${ticket.userId}`);
      } catch (pusherErr) {
        console.error('❌ [API] Pusher publish failed:', pusherErr);
      }
    }

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


