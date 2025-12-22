/**
 * Ticket Service - Core business logic for support ticketing system
 */

import { prisma } from '@/lib/prisma';
import { auditService } from './audit-service';
import { rateLimitService } from './rate-limit-service';
import type {
  CreateTicketInput,
  UpdateTicketInput,
  CreateMessageInput,
  CreateNoteInput,
  TicketFilters,
  Pagination,
  PaginatedResult,
  TicketDetail,
  SLAMetrics,
  DashboardStats,
  TicketStatus,
  TicketPriority,
  TicketCategory,
} from './types';

export class TicketService {
  /**
   * Generate unique ticket number
   */
  private async generateTicketNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await prisma.supportTicket.count({
      where: {
        ticketNumber: {
          startsWith: `TICK-${year}-`,
        },
      },
    });
    const nextNumber = (count + 1).toString().padStart(4, '0');
    return `TICK-${year}-${nextNumber}`;
  }

  /**
   * Create a new support ticket
   */
  async createTicket(data: CreateTicketInput): Promise<TicketDetail> {
    // Check rate limit
    const rateLimit = await rateLimitService.checkAndRecord(data.userId, 'ticket_create');
    if (!rateLimit.allowed) {
      throw new Error(`Rate limit exceeded. Try again after ${rateLimit.resetAt.toLocaleTimeString()}`);
    }

    const ticketNumber = await this.generateTicketNumber();

    // Create ticket with initial message in a transaction
    const ticket = await prisma.$transaction(async (tx: any) => {
      // Create ticket
      const newTicket = await tx.supportTicket.create({
        data: {
          ticketNumber,
          userId: data.userId,
          subject: data.subject,
          category: data.category,
          priority: data.priority || 'medium',
          source: data.source,
          telegramChatId: data.telegramChatId,
          status: 'open',
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      });

      // Create initial message
      await tx.supportMessage.create({
        data: {
          ticketId: newTicket.id,
          userId: data.userId,
          content: data.initialMessage,
          isInternal: false,
          source: data.source,
        },
      });

      // Log creation
      await auditService.logAction(newTicket.id, data.userId, 'ticket_created', {
        ticketNumber: newTicket.ticketNumber,
        category: data.category,
        priority: data.priority,
        source: data.source,
      });

      return newTicket;
    });

    // Auto-assign if priority is high or critical
    if (data.priority === 'high' || data.priority === 'critical') {
      await this.autoAssignTicket(ticket.id);
    }

    // Fetch full ticket detail
    return this.getTicketDetail(ticket.id);
  }

  /**
   * Get ticket detail with all relations
   */
  async getTicketDetail(ticketId: string, includeNotes = false): Promise<TicketDetail> {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            avatarUrl: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        messages: {
          where: {
            isInternal: false, // Exclude internal messages from main list
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
        },
        attachments: {
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
            url: true,
            uploadedBy: true,
            uploadedAt: true,
          },
        },
        ...(includeNotes && {
          notes: {
            include: {
              agent: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        }),
      },
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    return ticket as any; // Type assertion since Prisma types are complex
  }

  /**
   * List tickets with filters and pagination
   */
  async listTickets(
    filters: TicketFilters,
    pagination: Pagination
  ): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (filters.status) {
      where.status = Array.isArray(filters.status) ? { in: filters.status } : filters.status;
    }

    if (filters.priority) {
      where.priority = Array.isArray(filters.priority) ? { in: filters.priority } : filters.priority;
    }

    if (filters.category) {
      where.category = Array.isArray(filters.category) ? { in: filters.category } : filters.category;
    }

    if (filters.assignedToId !== undefined) {
      where.assignedToId = filters.assignedToId;
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.source) {
      where.source = filters.source;
    }

    if (filters.search) {
      where.OR = [
        { ticketNumber: { contains: filters.search, mode: 'insensitive' } },
        { subject: { contains: filters.search, mode: 'insensitive' } },
        { user: { username: { contains: filters.search, mode: 'insensitive' } } },
        { user: { email: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    // Fetch tickets and total count
    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              avatarUrl: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
          _count: {
            select: {
              messages: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return {
      data: tickets,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update ticket status
   */
  async updateStatus(
    ticketId: string,
    status: TicketStatus,
    userId: string
  ): Promise<void> {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { status: true },
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    const updates: any = { status };

    // Set timestamps based on status
    if (status === 'resolved' && ticket.status !== 'resolved') {
      updates.resolvedAt = new Date();
    }

    if (status === 'closed' && ticket.status !== 'closed') {
      updates.closedAt = new Date();
    }

    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: updates,
    });

    // Log status change
    await auditService.logFieldChange(ticketId, userId, 'status', ticket.status, status);
  }

  /**
   * Update ticket (status, priority, assignment)
   */
  async updateTicket(
    ticketId: string,
    updates: UpdateTicketInput,
    userId: string
  ): Promise<void> {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        status: true,
        priority: true,
        assignedToId: true,
      },
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    const changes: Array<{ fieldName: string; oldValue: any; newValue: any }> = [];

    if (updates.status && updates.status !== ticket.status) {
      changes.push({ fieldName: 'status', oldValue: ticket.status, newValue: updates.status });
    }

    if (updates.priority && updates.priority !== ticket.priority) {
      changes.push({ fieldName: 'priority', oldValue: ticket.priority, newValue: updates.priority });
    }

    if (updates.assignedToId !== undefined && updates.assignedToId !== ticket.assignedToId) {
      changes.push({
        fieldName: 'assignedToId',
        oldValue: ticket.assignedToId,
        newValue: updates.assignedToId,
      });
    }

    if (changes.length === 0) {
      return; // No changes
    }

    // Update ticket
    const data: any = {};
    if (updates.status) data.status = updates.status;
    if (updates.priority) data.priority = updates.priority;
    if (updates.assignedToId !== undefined) data.assignedToId = updates.assignedToId;

    // Add timestamps
    if (updates.status === 'resolved') {
      data.resolvedAt = new Date();
    }
    if (updates.status === 'closed') {
      data.closedAt = new Date();
    }

    await prisma.supportTicket.update({
      where: { id: ticketId },
      data,
    });

    // Log all changes
    await auditService.logFieldChanges(ticketId, userId, changes);
  }

  /**
   * Assign ticket to agent
   */
  async assignTicket(ticketId: string, agentId: string, assignedBy: string): Promise<void> {
    const [ticket, agent] = await Promise.all([
      prisma.supportTicket.findUnique({
        where: { id: ticketId },
        select: { assignedToId: true },
      }),
      prisma.user.findUnique({
        where: { id: agentId },
        select: { supportRole: true },
      }),
    ]);

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    if (!agent || (!agent.supportRole || !['agent', 'admin'].includes(agent.supportRole))) {
      throw new Error('Invalid agent: user must have agent or admin role');
    }

    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { assignedToId: agentId },
    });

    await auditService.logFieldChange(
      ticketId,
      assignedBy,
      'assignedToId',
      ticket.assignedToId,
      agentId
    );
  }

  /**
   * Auto-assign ticket based on workload and availability
   */
  async autoAssignTicket(ticketId: string): Promise<void> {
    // Get all available agents
    const agents = await prisma.user.findMany({
      where: {
        supportRole: {
          in: ['agent', 'admin'],
        },
      },
      select: {
        id: true,
        _count: {
          select: {
            ticketsAssigned: {
              where: {
                status: {
                  in: ['open', 'pending'],
                },
              },
            },
          },
        },
      },
    });

    if (agents.length === 0) {
      return; // No agents available
    }

    // Find agent with least workload
    const leastBusyAgent = agents.reduce((min: any, agent: any) =>
      agent._count.ticketsAssigned < min._count.ticketsAssigned ? agent : min
    );

    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { assignedToId: leastBusyAgent.id },
    });

    await auditService.logAction(ticketId, 'system', 'auto_assigned', {
      agentId: leastBusyAgent.id,
      workload: leastBusyAgent._count.ticketsAssigned,
    });
  }

  /**
   * Add message to ticket
   */
  async addMessage(data: CreateMessageInput): Promise<void> {
    // Check rate limit
    const rateLimit = await rateLimitService.checkAndRecord(data.userId, 'message_send');
    if (!rateLimit.allowed) {
      throw new Error(`Rate limit exceeded. Try again after ${rateLimit.resetAt.toLocaleTimeString()}`);
    }

    await prisma.$transaction(async (tx: any) => {
      // Create message
      await tx.supportMessage.create({
        data: {
          ticketId: data.ticketId,
          userId: data.userId,
          content: data.content,
          isInternal: data.isInternal || false,
          source: data.source,
          telegramMessageId: data.telegramMessageId,
        },
      });

      // Update first response time if this is the first agent response
      const ticket = await tx.supportTicket.findUnique({
        where: { id: data.ticketId },
        select: { firstResponseAt: true, userId: true },
      });

      if (!ticket?.firstResponseAt && data.userId !== ticket?.userId) {
        await tx.supportTicket.update({
          where: { id: data.ticketId },
          data: { firstResponseAt: new Date() },
        });
      }
    });

    await auditService.logAction(data.ticketId, data.userId, 'message_added', {
      isInternal: data.isInternal,
      source: data.source,
    });
  }

  /**
   * Add internal note (agents only)
   */
  async addNote(data: CreateNoteInput): Promise<void> {
    await prisma.supportNote.create({
      data: {
        ticketId: data.ticketId,
        agentId: data.agentId,
        content: data.content,
      },
    });

    await auditService.logAction(data.ticketId, data.agentId, 'note_added');
  }

  /**
   * Calculate SLA metrics for a ticket
   */
  async calculateSLA(ticketId: string): Promise<SLAMetrics> {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        createdAt: true,
        firstResponseAt: true,
        resolvedAt: true,
        priority: true,
      },
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    // SLA targets based on priority
    const targets = {
      low: { responseMinutes: 240, resolutionHours: 48 },
      medium: { responseMinutes: 120, resolutionHours: 24 },
      high: { responseMinutes: 60, resolutionHours: 8 },
      critical: { responseMinutes: 30, resolutionHours: 4 },
    };

    const target = targets[ticket.priority as TicketPriority];

    const firstResponseTime = ticket.firstResponseAt
      ? Math.floor((ticket.firstResponseAt.getTime() - ticket.createdAt.getTime()) / 1000 / 60)
      : null;

    const resolutionTime = ticket.resolvedAt
      ? Math.floor((ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) / 1000 / 60 / 60)
      : null;

    const isOverdue = !ticket.firstResponseAt && Date.now() - ticket.createdAt.getTime() > target.responseMinutes * 60 * 1000;

    return {
      firstResponseTime,
      resolutionTime,
      isOverdue,
      targetResponseTime: target.responseMinutes,
      targetResolutionTime: target.resolutionHours,
    };
  }

  /**
   * Close ticket with resolution
   */
  async closeTicket(ticketId: string, resolution: string, closedBy: string): Promise<void> {
    await prisma.$transaction(async (tx: any) => {
      // Update ticket status
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          status: 'closed',
          closedAt: new Date(),
          resolvedAt: new Date(), // Also set resolved if not already
        },
      });

      // Add resolution message
      await tx.supportMessage.create({
        data: {
          ticketId,
          userId: closedBy,
          content: `Ticket closed. Resolution: ${resolution}`,
          isInternal: false,
          source: 'agent',
        },
      });
    });

    await auditService.logAction(ticketId, closedBy, 'ticket_closed', { resolution });
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Parallel queries for performance
    const [
      ticketsByStatus,
      ticketsByPriority,
      ticketsByCategory,
      todayTickets,
      todayResolved,
      avgResponseTime,
      avgResolutionTime,
      agentWorkload,
    ] = await Promise.all([
      // Tickets by status
      prisma.supportTicket.groupBy({
        by: ['status'],
        _count: true,
      }),

      // Tickets by priority
      prisma.supportTicket.groupBy({
        by: ['priority'],
        where: {
          status: {
            notIn: ['closed'],
          },
        },
        _count: true,
      }),

      // Tickets by category
      prisma.supportTicket.groupBy({
        by: ['category'],
        where: {
          createdAt: {
            gte: todayStart,
          },
        },
        _count: true,
      }),

      // Today's tickets
      prisma.supportTicket.count({
        where: {
          createdAt: {
            gte: todayStart,
          },
        },
      }),

      // Today's resolved
      prisma.supportTicket.count({
        where: {
          resolvedAt: {
            gte: todayStart,
          },
        },
      }),

      // Average first response time
      prisma.supportTicket.aggregate({
        where: {
          firstResponseAt: {
            not: null,
          },
          createdAt: {
            gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
        _avg: {
          firstResponseAt: true,
        },
      }),

      // Average resolution time
      prisma.supportTicket.aggregate({
        where: {
          resolvedAt: {
            not: null,
          },
          createdAt: {
            gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          },
        },
        _avg: {
          resolvedAt: true,
        },
      }),

      // Agent workload
      prisma.user.findMany({
        where: {
          supportRole: {
            in: ['agent', 'admin'],
          },
        },
        select: {
          id: true,
          name: true,
          username: true,
          _count: {
            select: {
              ticketsAssigned: {
                where: {
                  status: {
                    in: ['open', 'pending'],
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    // Format results
    const statusMap = ticketsByStatus.reduce(
      (acc: any, { status, _count }: any) => {
        acc[status as TicketStatus] = _count;
        return acc;
      },
      { open: 0, pending: 0, resolved: 0, closed: 0 } as Record<TicketStatus, number>
    );

    const priorityMap = ticketsByPriority.reduce(
      (acc: any, { priority, _count }: any) => {
        acc[priority as TicketPriority] = _count;
        return acc;
      },
      { low: 0, medium: 0, high: 0, critical: 0 } as Record<TicketPriority, number>
    );

    const categoryMap = ticketsByCategory.reduce(
      (acc: any, { category, _count }: any) => {
        acc[category as TicketCategory] = _count;
        return acc;
      },
      { deposit: 0, withdrawal: 0, dispute: 0, bug: 0, kyc: 0, general: 0 } as Record<TicketCategory, number>
    );

    return {
      openTickets: statusMap.open,
      pendingTickets: statusMap.pending,
      resolvedToday: todayResolved,
      avgFirstResponseTime: 30, // Placeholder - calculate from data
      avgResolutionTime: 4, // Placeholder - calculate from data
      ticketsToday: todayTickets,
      ticketsByCategory: categoryMap,
      ticketsByPriority: priorityMap,
      ticketsByStatus: statusMap,
      agentWorkload: agentWorkload.map((agent: any) => ({
        agentId: agent.id,
        name: agent.name || agent.username || 'Unknown',
        username: agent.username,
        activeTickets: agent._count.ticketsAssigned,
        resolvedToday: 0, // TODO: Calculate
      })),
    };
  }
}

// Export singleton instance
export const ticketService = new TicketService();
