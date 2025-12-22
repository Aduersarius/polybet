/**
 * Telegram Bot Service
 * Core bot logic for handling messages and commands
 */

import { prisma } from '@/lib/prisma';
import { ticketService } from '@/lib/support/ticket-service';
import { telegramLinkingService } from './linking-service';
import { telegramNotificationService } from './notification-service';
import type { TelegramUpdate, TelegramMessage } from './types';

export class TelegramService {
  private botToken: string;
  private baseUrl: string;
  private websiteUrl: string;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
    this.websiteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://yourdomain.com';
  }

  /**
   * Process incoming Telegram update
   */
  async processUpdate(update: TelegramUpdate): Promise<void> {
    try {
      const message = update.message;
      
      if (!message || !message.from || message.from.is_bot) {
        return; // Ignore bot messages and invalid updates
      }

      const chatId = message.chat.id.toString();
      const telegramId = message.from.id.toString();
      const text = message.text || message.caption || '';

      // Handle commands
      if (text.startsWith('/')) {
        await this.handleCommand(text, chatId, telegramId, message);
        return;
      }

      // Handle regular messages (create/update ticket)
      await this.handleMessage(text, chatId, telegramId, message);
    } catch (error) {
      console.error('Error processing Telegram update:', error);
    }
  }

  /**
   * Handle bot commands
   */
  private async handleCommand(
    command: string,
    chatId: string,
    telegramId: string,
    message: TelegramMessage
  ): Promise<void> {
    const cmd = command.split(' ')[0].toLowerCase();

    switch (cmd) {
      case '/start':
        await this.handleStartCommand(chatId, message);
        break;
      case '/help':
        await this.handleHelpCommand(chatId);
        break;
      case '/ticket':
        await this.handleTicketCommand(chatId, telegramId);
        break;
      case '/link':
        await this.handleLinkCommand(chatId, telegramId, message);
        break;
      default:
        await this.sendMessage(chatId, 'Unknown command. Type /help to see available commands.');
    }
  }

  /**
   * Handle /start command
   */
  private async handleStartCommand(chatId: string, message: TelegramMessage): Promise<void> {
    const firstName = message.from?.first_name || 'there';
    
    const text = `
👋 *Welcome to PolyBet Support, ${firstName}!*

I'm your support assistant. You can:

• Send me a message to create a support ticket
• Get help from our support team
• Link your Telegram account to your PolyBet account

*Commands:*
/help - Show all available commands
/ticket - View your open tickets
/link - Link your Telegram to PolyBet account

*Need help?*
Just send me a message describing your issue, and I'll create a support ticket for you!
`;

    await this.sendMessage(chatId, text);
  }

  /**
   * Handle /help command
   */
  private async handleHelpCommand(chatId: string): Promise<void> {
    const text = `
🆘 *PolyBet Support Bot Help*

*Available Commands:*

/start - Start interacting with the bot
/help - Show this help message
/ticket - View your open support tickets
/link - Link your Telegram to your PolyBet account

*How to get support:*

1️⃣ Simply send me a message describing your issue
2️⃣ I'll create a support ticket automatically
3️⃣ Our support team will respond to your ticket
4️⃣ You'll receive replies right here in Telegram

*Account Linking:*

Link your Telegram account to your PolyBet account for:
• Faster support
• Access to your ticket history
• Personalized assistance

Type /link to get started!

*Need immediate help?*
Visit: ${this.websiteUrl}/support
`;

    await this.sendMessage(chatId, text);
  }

  /**
   * Handle /ticket command
   */
  private async handleTicketCommand(chatId: string, telegramId: string): Promise<void> {
    try {
      // Get or create Telegram user
      const telegramUser = await prisma.telegramUser.findUnique({
        where: { telegramId },
        include: { user: true },
      });

      if (!telegramUser || !telegramUser.userId) {
        await this.sendMessage(
          chatId,
          '❌ You need to link your Telegram account first. Use /link to connect your account.'
        );
        return;
      }

      // Get user's tickets
      const tickets = await ticketService.listTickets(
        {
          userId: telegramUser.userId,
          status: ['open', 'pending'],
        },
        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        }
      );

      if (tickets.data.length === 0) {
        await this.sendMessage(
          chatId,
          '✅ You have no open tickets.\n\nSend me a message if you need support!'
        );
        return;
      }

      // Format tickets
      let text = '🎫 *Your Open Tickets:*\n\n';
      
      for (const ticket of tickets.data) {
        const statusEmoji = ticket.status === 'open' ? '🟢' : '🟡';
        text += `${statusEmoji} *${ticket.ticketNumber}*\n`;
        text += `   ${ticket.subject}\n`;
        text += `   Status: ${ticket.status} | Priority: ${ticket.priority}\n`;
        text += `   Messages: ${ticket._count?.messages || 0}\n\n`;
      }

      text += `\nView all tickets: ${this.websiteUrl}/support`;

      await this.sendMessage(chatId, text);
    } catch (error) {
      console.error('Error handling /ticket command:', error);
      await this.sendMessage(chatId, '❌ Failed to fetch your tickets. Please try again later.');
    }
  }

  /**
   * Handle /link command
   */
  private async handleLinkCommand(
    chatId: string,
    telegramId: string,
    message: TelegramMessage
  ): Promise<void> {
    try {
      // Check if already linked
      const isLinked = await telegramLinkingService.isLinked(telegramId);
      
      if (isLinked) {
        await this.sendMessage(
          chatId,
          '✅ Your Telegram account is already linked to your PolyBet account!'
        );
        return;
      }

      // Generate link code
      const code = await telegramLinkingService.generateLinkCode(
        telegramId,
        chatId,
        message.from?.username
      );

      const text = `
🔗 *Link Your Account*

Your 6-digit verification code:

\`${code}\`

*Steps to link:*
1. Go to ${this.websiteUrl}/settings/telegram
2. Enter this code
3. Click "Link Account"

⏱ This code expires in 10 minutes.

Note: You must be logged into your PolyBet account on the website.
`;

      await this.sendMessage(chatId, text);
    } catch (error) {
      console.error('Error handling /link command:', error);
      await this.sendMessage(chatId, '❌ Failed to generate link code. Please try again later.');
    }
  }

  /**
   * Handle regular messages (create or update ticket)
   */
  private async handleMessage(
    text: string,
    chatId: string,
    telegramId: string,
    message: TelegramMessage
  ): Promise<void> {
    try {
      if (!text || text.trim().length === 0) {
        return; // Ignore empty messages
      }

      // Get or create Telegram user
      const telegramUser = await telegramLinkingService.getOrCreateTelegramUser(
        telegramId,
        chatId,
        message.from?.first_name,
        message.from?.last_name,
        message.from?.username
      );

      // Determine the Polybet user ID (linked or temporary)
      const polybetUserId = telegramUser.userId;

      if (!polybetUserId) {
        // For unlinked users, suggest linking
        await this.sendMessage(
          chatId,
          '⚠️ You are not linked to a PolyBet account. Support tickets created here will be temporary.\n\nUse /link to connect your account for full access.'
        );
        // For now, don't create tickets for unlinked users
        // You can modify this behavior if you want to allow anonymous tickets
        return;
      }

      // Check if user has an open ticket from Telegram
      const existingTicket = await prisma.supportTicket.findFirst({
        where: {
          userId: polybetUserId,
          source: 'telegram',
          status: {
            in: ['open', 'pending'],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (existingTicket) {
        // Add message to existing ticket
        await ticketService.addMessage({
          ticketId: existingTicket.id,
          userId: polybetUserId,
          content: text,
          source: 'telegram',
          telegramMessageId: message.message_id,
        });

        await this.sendMessage(
          chatId,
          `✅ Message added to ticket *${existingTicket.ticketNumber}*\n\nOur support team will respond shortly.`
        );
      } else {
        // Create new ticket
        const ticket = await ticketService.createTicket({
          userId: polybetUserId,
          subject: text.substring(0, 100), // First 100 chars as subject
          category: 'general',
          priority: 'medium',
          initialMessage: text,
          source: 'telegram',
        });

        await this.sendMessage(
          chatId,
          `✅ *Support Ticket Created*\n\nTicket: *${ticket.ticketNumber}*\n\nOur support team will review your request and respond shortly.`
        );
      }
    } catch (error) {
      console.error('Error handling message:', error);
      await this.sendMessage(chatId, '❌ Failed to process your message. Please try again later.');
    }
  }

  /**
   * Send a message to a Telegram chat
   */
  async sendMessage(
    chatId: string,
    text: string,
    options?: {
      parse_mode?: 'Markdown' | 'HTML';
      disable_web_page_preview?: boolean;
    }
  ): Promise<boolean> {
    if (!this.botToken) {
      console.warn('Telegram bot token not configured');
      return false;
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
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
      return false;
    }
  }

  /**
   * Set webhook URL
   */
  async setWebhook(url: string, secretToken?: string): Promise<boolean> {
    if (!this.botToken) {
      throw new Error('Telegram bot token not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          secret_token: secretToken,
          allowed_updates: ['message', 'callback_query'],
        }),
      });

      const data = await response.json();
      
      if (!response.ok || !data.ok) {
        console.error('Failed to set webhook:', data);
        return false;
      }

      console.log('Webhook set successfully:', data);
      return true;
    } catch (error) {
      console.error('Error setting webhook:', error);
      return false;
    }
  }

  /**
   * Get webhook info
   */
  async getWebhookInfo(): Promise<any> {
    if (!this.botToken) {
      throw new Error('Telegram bot token not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/getWebhookInfo`);
      const data = await response.json();
      return data.result;
    } catch (error) {
      console.error('Error getting webhook info:', error);
      return null;
    }
  }
}

export const telegramService = new TelegramService();
