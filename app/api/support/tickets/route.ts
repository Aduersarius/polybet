/**
 * Support Tickets API - List & Create
 * GET /api/support/tickets - List tickets with filters
 * POST /api/support/tickets - Create new ticket
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ticketService } from '@/lib/support/ticket-service';
import { canCreateTicket, sanitizeInput, isValidCategory, isValidPriority } from '@/lib/support/permissions';
import type { CreateTicketInput, TicketFilters, Pagination } from '@/lib/support/types';

/**
 * GET /api/support/tickets
 * List tickets with filters and pagination
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const user = session.user as any;

    // Build filters
    const filters: TicketFilters = {};

    // Status filter
    const status = searchParams.get('status');
    if (status) {
      filters.status = status.includes(',') ? status.split(',') as any : status as any;
    }

    // Priority filter
    const priority = searchParams.get('priority');
    if (priority) {
      filters.priority = priority.includes(',') ? priority.split(',') as any : priority as any;
    }

    // Category filter
    const category = searchParams.get('category');
    if (category) {
      filters.category = category.includes(',') ? category.split(',') as any : category as any;
    }

    // Assigned filter
    const assignedTo = searchParams.get('assignedTo');
    if (assignedTo) {
      filters.assignedToId = assignedTo === 'unassigned' ? null : assignedTo;
    }

    // Source filter
    const source = searchParams.get('source');
    if (source === 'web' || source === 'telegram') {
      filters.source = source;
    }

    // Search filter
    const search = searchParams.get('search');
    if (search) {
      filters.search = search;
    }

    // Non-agents/admins can only see their own tickets
    // Enforce userId filter for regular users (not agents or admins)
    // This ensures users in the support live chat window only see their own tickets
    const isAgentOrAdmin = (user.supportRole === 'agent' || user.supportRole === 'admin') || user.isAdmin;
    if (!isAgentOrAdmin) {
      filters.userId = user.id;
    }

    // Pagination
    const pagination: Pagination = {
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '20'),
      sortBy: searchParams.get('sortBy') || 'createdAt',
      sortOrder: (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc',
    };

    const result = await ticketService.listTickets(filters, pagination);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error listing tickets:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list tickets' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/support/tickets
 * Create a new support ticket
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;

    if (!canCreateTicket(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.subject || !body.category || !body.initialMessage) {
      return NextResponse.json(
        { error: 'Missing required fields: subject, category, initialMessage' },
        { status: 400 }
      );
    }

    // Validate category
    if (!isValidCategory(body.category)) {
      return NextResponse.json(
        { error: 'Invalid category. Must be one of: deposit, withdrawal, dispute, bug, kyc, general' },
        { status: 400 }
      );
    }

    // Validate priority if provided
    if (body.priority && !isValidPriority(body.priority)) {
      return NextResponse.json(
        { error: 'Invalid priority. Must be one of: low, medium, high, critical' },
        { status: 400 }
      );
    }

    // Sanitize input
    const input: CreateTicketInput = {
      userId: user.id,
      subject: sanitizeInput(body.subject.trim()),
      category: body.category,
      priority: body.priority || 'medium',
      source: body.source || 'web',
      initialMessage: sanitizeInput(body.initialMessage.trim()),
      telegramChatId: body.telegramChatId,
    };

    const ticket = await ticketService.createTicket(input);

    // Broadcast ticket creation to all agents/admins via Redis (non-blocking)
    (async () => {
      try {
        const { publishAdminEvent } = await import('@/lib/redis-admin');
        const payload = {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          category: ticket.category,
          userId: (ticket as any).userId || (ticket as any).user?.id,
          createdAt: ticket.createdAt,
        };
        console.log('📡 [API] Publishing ticket-created event:', payload);
        await publishAdminEvent('ticket-created', payload);
        console.log('✅ [API] Successfully published ticket-created event');
      } catch (error) {
        console.error('❌ [API] Failed to broadcast ticket creation:', error);
        // Continue even if broadcast fails - ticket creation should succeed
      }
    })();

    return NextResponse.json(ticket, { status: 201 });
  } catch (error) {
    console.error('Error creating ticket:', error);
    
    // Handle rate limit errors
    if (error instanceof Error && error.message.includes('Rate limit')) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create ticket' },
      { status: 500 }
    );
  }
}


