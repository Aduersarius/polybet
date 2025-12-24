/**
 * Support System Permissions & Authorization
 */

import { prisma } from '@/lib/prisma';
import type { SupportRole } from './types';

export interface SupportUser {
  id: string;
  supportRole: SupportRole | null;
  isAdmin: boolean;
}

/**
 * Check if user can view a ticket
 */
export async function canViewTicket(user: SupportUser, ticketId: string): Promise<boolean> {
  // Agents, support managers, and admins can view all tickets
  if (user.supportRole === 'agent' || user.supportRole === 'admin' || user.supportRole === 'support_manager' || user.isAdmin) {
    return true;
  }

  // Users can view their own tickets
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { userId: true },
  });

  return ticket?.userId === user.id;
}

/**
 * Check if user can create tickets
 */
export function canCreateTicket(user: SupportUser): boolean {
  // All authenticated users can create tickets
  return true;
}

/**
 * Check if user can send messages to a ticket
 */
export async function canSendMessage(user: SupportUser, ticketId: string): Promise<boolean> {
  // Agents and admins can send messages to any ticket
  if (user.supportRole === 'agent' || user.supportRole === 'admin' || user.isAdmin) {
    return true;
  }

  // Users can send messages to their own tickets
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { userId: true },
  });

  return ticket?.userId === user.id;
}

/**
 * Check if user can assign tickets
 */
export function canAssignTicket(user: SupportUser): boolean {
  // Only admins can assign tickets to others
  return user.supportRole === 'admin' || user.isAdmin;
}

/**
 * Check if user can view internal notes
 */
export function canViewInternalNotes(user: SupportUser): boolean {
  return user.supportRole === 'agent' || user.supportRole === 'admin' || user.supportRole === 'support_manager' || user.isAdmin;
}

/**
 * Check if user can add internal notes
 */
export function canAddInternalNote(user: SupportUser): boolean {
  return user.supportRole === 'agent' || user.supportRole === 'admin' || user.isAdmin;
}

/**
 * Check if user can update ticket status/priority
 */
export function canUpdateTicket(user: SupportUser): boolean {
  return user.supportRole === 'agent' || user.supportRole === 'admin' || user.supportRole === 'support_manager' || user.isAdmin;
}

/**
 * Check if user can close tickets
 */
export async function canCloseTicket(user: SupportUser, ticketId: string): Promise<boolean> {
  // Agents and admins can close any ticket
  if (user.supportRole === 'agent' || user.supportRole === 'admin' || user.isAdmin) {
    return true;
  }

  // Users can close their own tickets
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { userId: true },
  });

  return ticket?.userId === user.id;
}

/**
 * Check if user can view dashboard
 */
export function canViewDashboard(user: SupportUser): boolean {
  return user.supportRole === 'agent' || user.supportRole === 'admin' || user.supportRole === 'support_manager' || user.isAdmin;
}

/**
 * Check if user can manage agents (promote/demote)
 */
export function canManageAgents(user: SupportUser): boolean {
  return user.supportRole === 'admin' || user.isAdmin;
}

/**
 * Check if user can view audit logs
 */
export function canViewAuditLogs(user: SupportUser): boolean {
  return user.supportRole === 'admin' || user.isAdmin;
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate ticket category
 */
export function isValidCategory(category: string): boolean {
  return ['deposit', 'withdrawal', 'dispute', 'bug', 'kyc', 'general'].includes(category);
}

/**
 * Validate ticket priority
 */
export function isValidPriority(priority: string): boolean {
  return ['low', 'medium', 'high', 'critical'].includes(priority);
}

/**
 * Validate ticket status
 */
export function isValidStatus(status: string): boolean {
  return ['open', 'pending', 'resolved', 'closed'].includes(status);
}
