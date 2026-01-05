/**
 * Telegram Notification Service
 * Sends notifications to Telegram users about ticket updates
 */

import { prisma } from '@/lib/prisma';

export class TelegramNotificationService {
  private botToken: string;
  private baseUrl: string;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  /**
   * Send a message to a Telegram chat
   */
  private async sendTelegramMessage(
    chatId: string,
    text: string,
    options?: {
      parse_mode?: 'Markdown' | 'HTML';
      disable_web_page_preview?: boolean;
    }
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.botToken) {
      console.warn('Telegram bot token not configured');
      return { success: false, error: 'Bot token not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: options?.parse_mode || 'Markdown',
          disable_web_page_preview: options?.disable_web_page_preview ?? true,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        console.error('Telegram API error:', data);
        return { success: false, error: data.description || 'Failed to send message' };
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Notify user about a new reply from support agent
   */
  async notifyTicketReply(ticketId: string, messageContent: string, agentName: string): Promise<boolean> {
    try {
      // Get ticket with Telegram user info
      const ticket = await prisma.supportTicket.findUnique({
        where: { id: ticketId },
        include: {
          user: {
            include: {
              telegramLink: true,
            },
          },
        },
      });

      if (!ticket) {
        console.warn('Ticket not found:', ticketId);
        return false;
      }

      // Only send if ticket was created via Telegram or user has Telegram linked
      const telegramUser = ticket.user.telegramLink;

      if (!telegramUser || !telegramUser.isVerified) {
        console.log('User does not have verified Telegram account');
        return false;
      }

      // Format message
      const text = `
🎫 *Support Reply - ${ticket.ticketNumber}*

${agentName} replied to your ticket:

"${messageContent}"

---
Subject: ${ticket.subject}
Status: ${ticket.status}
Priority: ${ticket.priority}
`;

      const result = await this.sendTelegramMessage(telegramUser.chatId, text);
      return result.success;
    } catch (error) {
      console.error('Failed to notify ticket reply:', error);
      return false;
    }
  }

  /**
   * Notify user about ticket status change
   */
  async notifyStatusChange(ticketId: string, oldStatus: string, newStatus: string): Promise<boolean> {
    try {
      const ticket = await prisma.supportTicket.findUnique({
        where: { id: ticketId },
        include: {
          user: {
            include: {
              telegramLink: true,
            },
          },
        },
      });

      if (!ticket?.user.telegramLink?.isVerified) {
        return false;
      }

      const statusEmojis: Record<string, string> = {
        open: '🟢',
        pending: '🟡',
        resolved: '🔵',
        closed: '⚫',
      };

      const text = `
${statusEmojis[newStatus] || '🔔'} *Ticket Status Updated*

Ticket: *${ticket.ticketNumber}*
Subject: ${ticket.subject}

Status changed: ${statusEmojis[oldStatus] || ''} ${oldStatus} → ${statusEmojis[newStatus] || ''} ${newStatus}
`;

      const result = await this.sendTelegramMessage(ticket.user.telegramLink.chatId, text);
      return result.success;
    } catch (error) {
      console.error('Failed to notify status change:', error);
      return false;
    }
  }

  /**
   * Notify user when ticket is assigned to an agent
   */
  async notifyAssignment(ticketId: string, agentName: string): Promise<boolean> {
    try {
      const ticket = await prisma.supportTicket.findUnique({
        where: { id: ticketId },
        include: {
          user: {
            include: {
              telegramLink: true,
            },
          },
        },
      });

      if (!ticket?.user.telegramLink?.isVerified) {
        return false;
      }

      const text = `
👤 *Ticket Assigned*

Ticket: *${ticket.ticketNumber}*
Subject: ${ticket.subject}

Your ticket has been assigned to *${agentName}*. They will review your request shortly.
`;

      const result = await this.sendTelegramMessage(ticket.user.telegramLink.chatId, text);
      return result.success;
    } catch (error) {
      console.error('Failed to notify assignment:', error);
      return false;
    }
  }

  /**
   * Send a welcome message when ticket is created
   */
  async notifyTicketCreated(ticketId: string): Promise<boolean> {
    try {
      const ticket = await prisma.supportTicket.findUnique({
        where: { id: ticketId },
        include: {
          user: {
            include: {
              telegramLink: true,
            },
          },
        },
      });

      if (!ticket?.user.telegramLink?.isVerified || ticket.source !== 'telegram') {
        return false;
      }

      const text = `
✅ *Support Ticket Created*

Ticket Number: *${ticket.ticketNumber}*
Subject: ${ticket.subject}
Priority: ${ticket.priority}
Status: ${ticket.status}

Your request has been received. Our support team will respond shortly.

You can reply to this chat to add more details to your ticket.
`;

      const result = await this.sendTelegramMessage(ticket.user.telegramLink.chatId, text);
      return result.success;
    } catch (error) {
      console.error('Failed to notify ticket created:', error);
      return false;
    }
  }

  /**
   * Notify admins about a new withdrawal request
   */
  async notifyWithdrawalRequest(withdrawalId: string): Promise<boolean> {
    try {
      // Get withdrawal details with user info
      const withdrawal = await prisma.withdrawal.findUnique({
        where: { id: withdrawalId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
            },
          },
        },
      });

      if (!withdrawal) {
        console.warn('Withdrawal not found:', withdrawalId);
        return false;
      }

      // Check if we should filter admins by environment variable
      const allowedAdminIds = process.env.ADMIN_TELEGRAM_NOTIFICATIONS
        ? process.env.ADMIN_TELEGRAM_NOTIFICATIONS.split(',').map(id => id.trim()).filter(Boolean)
        : null;

      // Build where clause for admins
      const adminWhere: any = {
        OR: [
          { isAdmin: true },
          { supportRole: 'admin' },
        ],
        telegramLink: {
          isVerified: true,
        },
      };

      // Filter by specific admin IDs if configured
      if (allowedAdminIds && allowedAdminIds.length > 0) {
        adminWhere.id = { in: allowedAdminIds };
      }

      // Get all admins with verified Telegram accounts
      const admins = await prisma.user.findMany({
        where: adminWhere,
        include: {
          telegramLink: {
            select: {
              chatId: true,
            },
          },
        },
      });

      if (admins.length === 0) {
        console.log('No admins with verified Telegram accounts found');
        return false;
      }

      // Format withdrawal details
      const userName = withdrawal.user.name || withdrawal.user.username || withdrawal.user.email || 'Unknown User';
      const amount = Number(withdrawal.amount).toFixed(2);
      const currency = withdrawal.currency || 'USDC';
      const timestamp = new Date(withdrawal.createdAt).toLocaleString('en-US', {
        dateStyle: 'short',
        timeStyle: 'short',
      });

      // Get admin panel URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pariflow.com';
      const adminPanelUrl = `${baseUrl}/admin/withdrawals`;

      const statusEmojis: Record<string, string> = {
        'PENDING': '⏳',
        'APPROVED': '✅',
        'COMPLETED': '💰',
        'FAILED': '❌',
        'REJECTED': '🚫'
      };
      const statusEmoji = statusEmojis[withdrawal.status] || '🔔';

      // Format message
      const text = `
💰 *New Withdrawal Request*

ID: *${withdrawalId}*
User: ${userName} (${withdrawal.user.email || 'No email'})
Amount: *$${amount} ${currency}*
Address: \`${withdrawal.toAddress}\`
Status: ${statusEmoji} ${withdrawal.status}
Time: ${timestamp}

[View in Admin Panel →](${adminPanelUrl})
`;

      // Send notification to all admins (non-blocking)
      const results = await Promise.allSettled(
        admins.map((admin: typeof admins[0]) =>
          this.sendTelegramMessage(admin.telegramLink!.chatId, text)
        )
      );

      // Count successful sends
      const successCount = results.filter(
        (result) => result.status === 'fulfilled' && result.value.success
      ).length;

      if (successCount > 0) {
        console.log(`Sent withdrawal notification to ${successCount}/${admins.length} admins`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to notify withdrawal request:', error);
      return false;
    }
  }
}

export const telegramNotificationService = new TelegramNotificationService();

