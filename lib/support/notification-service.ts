import Pusher from 'pusher-js';
import type { TicketDetail } from './types';

class NotificationService {
  private pusher: Pusher | null = null;
  private channels: Map<string, any> = new Map();

  /**
   * Initialize Pusher client
   */
  initializeClient(): Pusher {
    if (this.pusher) return this.pusher;

    const key = process.env.NEXT_PUBLIC_SOKETI_APP_KEY || 'pariflow_key';
    const host = process.env.NEXT_PUBLIC_SOKETI_HOST || 'soketi.pariflow.com';
    const port = parseInt(process.env.NEXT_PUBLIC_SOKETI_PORT || '443');
    const useTLS = process.env.NEXT_PUBLIC_SOKETI_USE_TLS !== 'false';

    this.pusher = new Pusher(key, {
      wsHost: host,
      wsPort: port,
      wssPort: port,
      forceTLS: useTLS,
      enabledTransports: ['ws', 'wss'],
      disableStats: true,
      cluster: 'mt1',
    });

    this.pusher.connection.bind('connected', () => {
      console.log('🔌 Support WebSocket (Soketi) connected');
    });

    return this.pusher;
  }

  /**
   * Subscribe to a specific ticket for real-time updates
   */
  subscribeToTicket(ticketId: string): void {
    if (!this.pusher) return;
    const channelName = `ticket-${ticketId}`;
    if (!this.channels.has(channelName)) {
      const channel = this.pusher.subscribe(channelName);
      this.channels.set(channelName, channel);
    }
  }

  /**
   * Unsubscribe from a ticket
   */
  unsubscribeFromTicket(ticketId: string): void {
    if (!this.pusher) return;
    const channelName = `ticket-${ticketId}`;
    this.pusher.unsubscribe(channelName);
    this.channels.delete(channelName);
  }

  /**
   * Subscribe to agent room (for agents only)
   */
  subscribeToAgentRoom(): void {
    if (!this.pusher) return;
    const channelName = 'support-agents';
    if (!this.channels.has(channelName)) {
      const channel = this.pusher.subscribe(channelName);
      this.channels.set(channelName, channel);
    }
  }

  /**
   * Listen for new messages
   */
  onNewMessage(ticketId: string, callback: (data: { ticketId: string; message: any }) => void): void {
    const channelName = `ticket-${ticketId}`;
    const channel = this.channels.get(channelName);
    if (channel) {
      channel.bind('support:new_message', callback);
    }
  }

  /**
   * Listen for status changes
   */
  onStatusChanged(ticketId: string, callback: (data: { ticketId: string; newStatus: string; oldStatus: string }) => void): void {
    const channelName = `ticket-${ticketId}`;
    const channel = this.channels.get(channelName);
    if (channel) {
      channel.bind('support:status_changed', callback);
    }
  }

  /**
   * Listen for new tickets (agents only)
   */
  onNewTicket(callback: (data: { ticket: any }) => void): void {
    const channel = this.channels.get('support-agents');
    if (channel) {
      channel.bind('support:new_ticket', callback);
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.pusher) {
      this.pusher.disconnect();
      this.pusher = null;
      this.channels.clear();
    }
  }

  /**
   * Get pusher instance
   */
  getPusher(): Pusher | null {
    return this.pusher;
  }
}

// Export singleton instance (client-side)
export const notificationService = new NotificationService();

// Server-side notification helpers (to be used in API routes)
export class ServerNotificationService {
  private static pusher: any = null;

  private static getPusher() {
    if (!this.pusher) {
      const PusherServer = require('pusher');
      this.pusher = new PusherServer({
        appId: process.env.NEXT_PUBLIC_SOKETI_APP_ID || 'pariflow',
        key: process.env.NEXT_PUBLIC_SOKETI_APP_KEY || 'pariflow_key',
        secret: process.env.SOKETI_DEFAULT_APP_SECRET || 'pariflow_secret',
        host: process.env.NEXT_PUBLIC_SOKETI_HOST || 'soketi.pariflow.com',
        port: process.env.NEXT_PUBLIC_SOKETI_PORT || '443',
        useTLS: true,
      });
    }
    return this.pusher;
  }

  /**
   * Notify user of new message
   */
  static async notifyNewMessage(ticketId: string, message: any): Promise<void> {
    try {
      await this.getPusher().trigger(`ticket-${ticketId}`, 'support:new_message', { ticketId, message });
      console.log(`[Notify] New message in ticket ${ticketId}`);
    } catch (err) {
      console.error('[Notify] Error notifying new message:', err);
    }
  }

  /**
   * Notify of status change
   */
  static async notifyStatusChange(ticketId: string, oldStatus: string, newStatus: string): Promise<void> {
    try {
      await this.getPusher().trigger(`ticket-${ticketId}`, 'support:status_changed', { ticketId, oldStatus, newStatus });
      console.log(`[Notify] Status changed for ticket ${ticketId}: ${oldStatus} -> ${newStatus}`);
    } catch (err) {
      console.error('[Notify] Error notifying status change:', err);
    }
  }

  /**
   * Notify agents of new ticket
   */
  static async notifyNewTicket(ticket: TicketDetail): Promise<void> {
    try {
      await this.getPusher().trigger('support-agents', 'support:new_ticket', { ticket });
      console.log(`[Notify] New ticket created: ${ticket.ticketNumber}`);
    } catch (err) {
      console.error('[Notify] Error notifying new ticket:', err);
    }
  }

  /**
   * Notify of ticket assignment
   */
  static async notifyTicketAssignment(ticketId: string, agent: any): Promise<void> {
    try {
      await this.getPusher().trigger(`ticket-${ticketId}`, 'support:assigned', { ticketId, agent });
      console.log(`[Notify] Ticket ${ticketId} assigned to ${agent.name}`);
    } catch (err) {
      console.error('[Notify] Error notifying ticket assignment:', err);
    }
  }
}

