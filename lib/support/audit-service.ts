/**
 * Audit Service - Immutable logging for support ticket actions
 */

import { prisma } from '@/lib/prisma';
import type { AuditLogEntry } from './types';

export class AuditService {
  /**
   * Log a ticket action
   */
  async logAction(
    ticketId: string,
    userId: string,
    action: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await prisma.supportAuditLog.create({
      data: {
        ticketId,
        userId,
        action,
        metadata: metadata || null,
      },
    });
  }

  /**
   * Log a field change
   */
  async logFieldChange(
    ticketId: string,
    userId: string,
    fieldName: string,
    oldValue: any,
    newValue: any
  ): Promise<void> {
    await prisma.supportAuditLog.create({
      data: {
        ticketId,
        userId,
        action: `${fieldName}_changed`,
        fieldName,
        oldValue: oldValue?.toString() || null,
        newValue: newValue?.toString() || null,
      },
    });
  }

  /**
   * Log multiple field changes in one transaction
   */
  async logFieldChanges(
    ticketId: string,
    userId: string,
    changes: Array<{ fieldName: string; oldValue: any; newValue: any }>
  ): Promise<void> {
    await prisma.$transaction(
      changes.map((change) =>
        prisma.supportAuditLog.create({
          data: {
            ticketId,
            userId,
            action: `${change.fieldName}_changed`,
            fieldName: change.fieldName,
            oldValue: change.oldValue?.toString() || null,
            newValue: change.newValue?.toString() || null,
          },
        })
      )
    );
  }

  /**
   * Get audit trail for a ticket
   */
  async getAuditTrail(ticketId: string): Promise<AuditLogEntry[]> {
    const logs = await prisma.supportAuditLog.findMany({
      where: { ticketId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return logs.map((log: any) => ({
      id: log.id,
      ticketId: log.ticketId,
      userId: log.userId,
      action: log.action,
      fieldName: log.fieldName,
      oldValue: log.oldValue,
      newValue: log.newValue,
      metadata: log.metadata as Record<string, any> | null,
      createdAt: log.createdAt,
      user: log.user,
    }));
  }

  /**
   * Get audit logs for a date range (admin reporting)
   */
  async getLogsInRange(
    startDate: Date,
    endDate: Date,
    filters?: {
      action?: string;
      userId?: string;
      ticketId?: string;
    }
  ): Promise<AuditLogEntry[]> {
    const logs = await prisma.supportAuditLog.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        ...(filters?.action && { action: filters.action }),
        ...(filters?.userId && { userId: filters.userId }),
        ...(filters?.ticketId && { ticketId: filters.ticketId }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000, // Limit for performance
    });

    return logs.map((log: any) => ({
      id: log.id,
      ticketId: log.ticketId,
      userId: log.userId,
      action: log.action,
      fieldName: log.fieldName,
      oldValue: log.oldValue,
      newValue: log.newValue,
      metadata: log.metadata as Record<string, any> | null,
      createdAt: log.createdAt,
      user: log.user,
    }));
  }

  /**
   * Get action count by user (for admin analytics)
   */
  async getActionCountByUser(
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ userId: string; userName: string; actionCount: number }>> {
    const result = await prisma.supportAuditLog.groupBy({
      by: ['userId'],
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: {
        id: true,
      },
    });

    // Fetch user details
    const userIds = result.map((r: any) => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, username: true },
    });

    const userMap = new Map(users.map((u: any) => [u.id, u]));

    return result.map((r: any) => {
      const user = userMap.get(r.userId) as any;
      return {
        userId: r.userId,
        userName: user?.name || user?.username || 'Unknown',
        actionCount: r._count.id,
      };
    });
  }
}

// Export singleton instance
export const auditService = new AuditService();
