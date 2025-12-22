/**
 * Support Ticketing System - Type Definitions
 */

export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type TicketCategory = 'deposit' | 'withdrawal' | 'dispute' | 'bug' | 'kyc' | 'general';
export type TicketSource = 'web' | 'telegram';
export type MessageSource = 'web' | 'telegram' | 'agent';
export type SupportRole = 'agent' | 'admin';

export interface CreateTicketInput {
  userId: string;
  subject: string;
  category: TicketCategory;
  priority?: TicketPriority;
  source: TicketSource;
  initialMessage: string;
  telegramChatId?: string;
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedToId?: string | null;
}

export interface CreateMessageInput {
  ticketId: string;
  userId: string;
  content: string;
  isInternal?: boolean;
  source: MessageSource;
  telegramMessageId?: number;
}

export interface CreateNoteInput {
  ticketId: string;
  agentId: string;
  content: string;
}

export interface TicketFilters {
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority | TicketPriority[];
  category?: TicketCategory | TicketCategory[];
  assignedToId?: string | null;
  userId?: string;
  source?: TicketSource;
  search?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TicketDetail {
  id: string;
  ticketNumber: string;
  userId: string;
  assignedToId: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  subject: string;
  source: TicketSource;
  telegramChatId: string | null;
  createdAt: Date;
  updatedAt: Date;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  user: {
    id: string;
    name: string | null;
    username: string | null;
    email: string | null;
    avatarUrl: string | null;
  };
  assignedTo: {
    id: string;
    name: string | null;
    username: string | null;
  } | null;
  messages: Array<{
    id: string;
    content: string;
    userId: string;
    isInternal: boolean;
    source: MessageSource;
    createdAt: Date;
    user: {
      id: string;
      name: string | null;
      username: string | null;
      avatarUrl: string | null;
    };
    attachments: Array<{
      id: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      url: string;
    }>;
  }>;
  attachments: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    url: string;
    uploadedBy: string;
    uploadedAt: Date;
  }>;
  notes?: Array<{
    id: string;
    content: string;
    agentId: string;
    createdAt: Date;
    agent: {
      id: string;
      name: string | null;
      username: string | null;
    };
  }>;
}

export interface SLAMetrics {
  firstResponseTime: number | null; // minutes
  resolutionTime: number | null; // hours
  isOverdue: boolean;
  targetResponseTime: number; // minutes
  targetResolutionTime: number; // hours
}

export interface DashboardStats {
  openTickets: number;
  pendingTickets: number;
  resolvedToday: number;
  avgFirstResponseTime: number; // minutes
  avgResolutionTime: number; // hours
  ticketsToday: number;
  ticketsByCategory: Record<TicketCategory, number>;
  ticketsByPriority: Record<TicketPriority, number>;
  ticketsByStatus: Record<TicketStatus, number>;
  agentWorkload: Array<{
    agentId: string;
    name: string;
    username: string | null;
    activeTickets: number;
    resolvedToday: number;
  }>;
}

export interface AuditLogEntry {
  id: string;
  ticketId: string;
  userId: string;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    username: string | null;
  };
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}
