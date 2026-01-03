/**
 * Telegram Account Linking Service
 * Handles linking Telegram accounts to Pariflow user accounts
 */

import { prisma } from '@/lib/prisma';
import { randomInt } from 'crypto';

export class TelegramLinkingService {
  /**
   * Generate a 6-digit link code valid for 10 minutes
   */
  async generateLinkCode(telegramId: string, chatId: string, telegramUsername?: string | null): Promise<string> {
    try {
      console.log(`[Linking] Generating link code for telegramId: ${telegramId}, chatId: ${chatId}`);

      // Generate 6-digit code
      const code = randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      console.log(`[Linking] Generated code: ${code}, expires at: ${expiresAt.toISOString()}`);

      // Check if TelegramUser already exists
      let telegramUser = await prisma.telegramUser.findUnique({
        where: { telegramId },
      });
      console.log(`[Linking] Existing telegramUser found: ${!!telegramUser}`);

      if (telegramUser) {
        // Update existing with new link code
        console.log(`[Linking] Updating existing TelegramUser with new link code`);
        await prisma.telegramUser.update({
          where: { telegramId },
          data: {
            linkCode: code,
            linkCodeExpiry: expiresAt,
            chatId,
            username: telegramUsername || telegramUser.username,
          },
        });
        console.log(`[Linking] Successfully updated TelegramUser`);
      } else {
        // Create new TelegramUser entry
        console.log(`[Linking] Creating new TelegramUser`);
        await prisma.telegramUser.create({
          data: {
            telegramId,
            chatId,
            username: telegramUsername,
            linkCode: code,
            linkCodeExpiry: expiresAt,
            isVerified: false,
          },
        });
        console.log(`[Linking] Successfully created TelegramUser`);
      }

      console.log(`[Linking] Returning code: ${code}`);
      return code;
    } catch (error) {
      console.error('[Linking] Error generating link code:', error);
      if (error instanceof Error) {
        console.error('[Linking] Error stack:', error.stack);
      }
      throw error;
    }
  }

  /**
   * Verify link code and link accounts
   */
  async verifyLinkCode(code: string, pariflowUserId: string): Promise<{ success: boolean; error?: string }> {
    // Find TelegramUser with this code
    const telegramUser = await prisma.telegramUser.findFirst({
      where: {
        linkCode: code,
        linkCodeExpiry: {
          gte: new Date(), // Not expired
        },
      },
    });

    if (!telegramUser) {
      return { success: false, error: 'Invalid or expired code' };
    }

    // Check if this Telegram account is already linked to another user
    if (telegramUser.userId && telegramUser.userId !== pariflowUserId) {
      return { success: false, error: 'This Telegram account is already linked to another user' };
    }

    // Check if this user already has a different Telegram account linked
    const existingLink = await prisma.telegramUser.findFirst({
      where: {
        userId: pariflowUserId,
        isVerified: true,
        telegramId: {
          not: telegramUser.telegramId,
        },
      },
    });

    if (existingLink) {
      return { success: false, error: 'Your account is already linked to a different Telegram account' };
    }

    // Link accounts
    await prisma.telegramUser.update({
      where: { id: telegramUser.id },
      data: {
        userId: pariflowUserId,
        isVerified: true,
        linkCode: null,
        linkCodeExpiry: null,
      },
    });

    return { success: true };
  }

  /**
   * Unlink Telegram account from Pariflow user
   */
  async unlinkAccount(pariflowUserId: string): Promise<boolean> {
    const result = await prisma.telegramUser.updateMany({
      where: {
        userId: pariflowUserId,
        isVerified: true,
      },
      data: {
        userId: null,
        isVerified: false,
      },
    });

    return result.count > 0;
  }

  /**
   * Get linked Telegram account for a Pariflow user
   */
  async getLinkedAccount(pariflowUserId: string) {
    return await prisma.telegramUser.findFirst({
      where: {
        userId: pariflowUserId,
        isVerified: true,
      },
    });
  }

  /**
   * Check if a Telegram user is linked to any Pariflow account
   */
  async isLinked(telegramId: string): Promise<boolean> {
    const telegramUser = await prisma.telegramUser.findUnique({
      where: { telegramId },
    });

    return telegramUser?.isVerified ?? false;
  }

  /**
   * Get or create TelegramUser entry
   */
  async getOrCreateTelegramUser(
    telegramId: string,
    chatId: string,
    firstName?: string,
    lastName?: string,
    username?: string
  ) {
    let telegramUser = await prisma.telegramUser.findUnique({
      where: { telegramId },
      include: { user: true },
    });

    if (!telegramUser) {
      telegramUser = await prisma.telegramUser.create({
        data: {
          telegramId,
          chatId,
          firstName,
          lastName,
          username,
          isVerified: false,
        },
        include: { user: true },
      });
    } else {
      // Update chat info if changed
      if (telegramUser.chatId !== chatId || telegramUser.username !== username) {
        telegramUser = await prisma.telegramUser.update({
          where: { telegramId },
          data: {
            chatId,
            firstName,
            lastName,
            username,
            lastActiveAt: new Date(),
          },
          include: { user: true },
        });
      }
    }

    return telegramUser;
  }
}

export const telegramLinkingService = new TelegramLinkingService();

