/**
 * Support Notification Service - Real-time notifications via WebSocket
 */

import { io as ioClient, Socket } from 'socket.io-client';
import type { TicketDetail } from './types';

// Server-side event types (for future WebSocket server extension)
export interface SupportWebSocketEvents {
  // Client -> Server
  'support:subscribe': (ticketId: string) => void;
  'support:unsubscribe': (ticketId: string) => void;
  'support:subscribe_agent_room': () => void;
  'support:typing': (ticketId: string) => void;
  
  // Server -> Client
  'support:new_message': (data: { ticketId: string; message: any }) => void;
  'support:status_changed': (data: { ticketId: string; newStatus: string; oldStatus: string }) => void;
  'support:assigned': (data: { ticketId: string; agent: any }) => void;
  'support:agent_typing': (data: { ticketId: string; agent: any }) => void;
  'support:new_ticket': (data: { ticket: any }) => void; // Only to agents
  'support:ticket_updated': (data: { ticketId: string; updates: any }) => void;
}

class NotificationService {
  private socket: Socket | null = null;

  /**
   * Initialize WebSocket connection (client-side)
   */
  initializeClient(wsUrl: string = 'http://localhost:3001'): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = ioClient(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('🔌 Support WebSocket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('🔌 Support WebSocket disconnected');
    });

    return this.socket;
  }

  /**
   * Subscribe to a specific ticket for real-time updates
   */
  subscribeToTicket(ticketId: string): void {
    if (!this.socket) {
      console.warn('WebSocket not initialized');
      return;
    }

    this.socket.emit('support:subscribe', ticketId);
  }

  /**
   * Unsubscribe from a ticket
   */
  unsubscribeFromTicket(ticketId: string): void {
    if (!this.socket) {
      console.warn('WebSocket not initialized');
      return;
    }

    this.socket.emit('support:unsubscribe', ticketId);
  }

  /**
   * Subscribe to agent room (for agents only)
   */
  subscribeToAgentRoom(): void {
    if (!this.socket) {
      console.warn('WebSocket not initialized');
      return;
    }

    this.socket.emit('support:subscribe_agent_room');
  }

  /**
   * Send typing indicator
   */
  sendTypingIndicator(ticketId: string): void {
    if (!this.socket) {
      console.warn('WebSocket not initialized');
      return;
    }

    this.socket.emit('support:typing', ticketId);
  }

  /**
   * Listen for new messages
   */
  onNewMessage(callback: (data: { ticketId: string; message: any }) => void): void {
    if (!this.socket) {
      console.warn('WebSocket not initialized');
      return;
    }

    this.socket.on('support:new_message', callback);
  }

  /**
   * Listen for status changes
   */
  onStatusChanged(callback: (data: { ticketId: string; newStatus: string; oldStatus: string }) => void): void {
    if (!this.socket) {
      console.warn('WebSocket not initialized');
      return;
    }

    this.socket.on('support:status_changed', callback);
  }

  /**
   * Listen for ticket assignments
   */
  onTicketAssigned(callback: (data: { ticketId: string; agent: any }) => void): void {
    if (!this.socket) {
      console.warn('WebSocket not initialized');
      return;
    }

    this.socket.on('support:assigned', callback);
  }

  /**
   * Listen for typing indicators
   */
  onAgentTyping(callback: (data: { ticketId: string; agent: any }) => void): void {
    if (!this.socket) {
      console.warn('WebSocket not initialized');
      return;
    }

    this.socket.on('support:agent_typing', callback);
  }

  /**
   * Listen for new tickets (agents only)
   */
  onNewTicket(callback: (data: { ticket: any }) => void): void {
    if (!this.socket) {
      console.warn('WebSocket not initialized');
      return;
    }

    this.socket.on('support:new_ticket', callback);
  }

  /**
   * Listen for ticket updates
   */
  onTicketUpdated(callback: (data: { ticketId: string; updates: any }) => void): void {
    if (!this.socket) {
      console.warn('WebSocket not initialized');
      return;
    }

    this.socket.on('support:ticket_updated', callback);
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Get socket instance
   */
  getSocket(): Socket | null {
    return this.socket;
  }
}

// Export singleton instance (client-side)
export const notificationService = new NotificationService();

// Server-side notification helpers (to be used in API routes)
export class ServerNotificationService {
  /**
   * Notify user of new message (would be called from API route)
   * Note: This requires the Socket.IO server instance to be accessible
   */
  static async notifyNewMessage(ticketId: string, message: any): Promise<void> {
    // This would emit to the WebSocket server
    // In a real implementation, you'd use a message queue or direct server access
    console.log(`[Notify] New message in ticket ${ticketId}`);
    // Example: io.to(`ticket-${ticketId}`).emit('support:new_message', { ticketId, message });
  }

  /**
   * Notify of status change
   */
  static async notifyStatusChange(ticketId: string, oldStatus: string, newStatus: string): Promise<void> {
    console.log(`[Notify] Status changed for ticket ${ticketId}: ${oldStatus} -> ${newStatus}`);
    // Example: io.to(`ticket-${ticketId}`).emit('support:status_changed', { ticketId, oldStatus, newStatus });
  }

  /**
   * Notify agents of new ticket
   */
  static async notifyNewTicket(ticket: TicketDetail): Promise<void> {
    console.log(`[Notify] New ticket created: ${ticket.ticketNumber}`);
    // Example: io.to('support-agents').emit('support:new_ticket', { ticket });
  }

  /**
   * Notify of ticket assignment
   */
  static async notifyTicketAssignment(ticketId: string, agent: any): Promise<void> {
    console.log(`[Notify] Ticket ${ticketId} assigned to ${agent.name}`);
    // Example: io.to(`ticket-${ticketId}`).emit('support:assigned', { ticketId, agent });
  }
}

