import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { promptLLM } from '@/lib/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow enough time for LLM generation

// Helper to simulate a trade
async function simulateTrade() {
    try {
        // 1. Pick a random bot
        const botCount = await prisma.user.count({ where: { isBot: true } });
        if (botCount === 0) return;
        const skipBot = Math.floor(Math.random() * botCount);
        const bot = await prisma.user.findFirst({
            where: { isBot: true },
            skip: skipBot
        });
        if (!bot) return;

        // 2. Pick a random active event
        const eventCount = await prisma.event.count({ where: { status: 'ACTIVE' } });
        if (eventCount === 0) return;
        const skipEvent = Math.floor(Math.random() * eventCount);
        const event = await prisma.event.findFirst({
            where: { status: 'ACTIVE' },
            include: { outcomes: true },
            skip: skipEvent
        });
        if (!event) return;

        // 3. Pick an outcome
        let outcomeId: string | null = null;
        let option = 'YES';
        let price = 0.5;

        if (event.outcomes.length > 0) {
            const randomOutcome = event.outcomes[Math.floor(Math.random() * event.outcomes.length)];
            outcomeId = randomOutcome.id;
            // Use 'YES' as generic option for multiple outcome items if needed, or the outcome name
            // For binary, it's usually YES/NO.
            // Let's rely on event type.
            if (event.type === 'BINARY') {
                option = Math.random() > 0.5 ? 'YES' : 'NO';
                price = option === 'YES' ? (event.yesOdds || 0.5) : (event.noOdds || 0.5);
            } else {
                option = randomOutcome.name; // For multiple, option is the outcome name
                price = randomOutcome.probability || (1 / event.outcomes.length);
            }
        } else {
            // Fallback for binary without outcomes
            option = Math.random() > 0.5 ? 'YES' : 'NO';
            price = 0.5;
        }

        // 4. Random amount $10 - $500
        const amount = 10 + Math.random() * 490;
        const shares = amount / Math.max(0.01, price);

        // 5. Create Order and MarketActivity
        await prisma.$transaction(async (tx: any) => {
            // Create Order
            const order = await tx.order.create({
                data: {
                    userId: bot.id,
                    eventId: event.id,
                    outcomeId: outcomeId,
                    option: option,
                    side: 'buy', // Mostly buy for bots to show support
                    price: new prisma.Prisma.Decimal(price),
                    amount: new prisma.Prisma.Decimal(amount),
                    amountFilled: new prisma.Prisma.Decimal(shares),
                    status: 'filled',
                    orderType: 'market',
                    visibleAmount: new prisma.Prisma.Decimal(amount)
                }
            });

            // Create Market Activity (This triggers the chat badge)
            await tx.marketActivity.create({
                data: {
                    userId: bot.id,
                    eventId: event.id,
                    type: 'TRADE',
                    side: 'buy',
                    option: option,
                    outcomeId: outcomeId,
                    amount: new prisma.Prisma.Decimal(amount),
                    price: new prisma.Prisma.Decimal(price),
                    isAmmInteraction: true,
                    orderId: order.id
                }
            });

            // Update/Create Balance (The Portfolio)
            const tokenSymbol = outcomeId ? `OUT_${outcomeId}` : option;

            // Upsert Balance logic
            // We use findFirst + upsert approach or just upsert if we are confident on the unique key
            // The unique key is @@unique([userId, tokenSymbol, eventId, outcomeId])
            // Note: outcomeId is nullable. Prisma requires explicit null if it's part of the key.

            await tx.balance.upsert({
                where: {
                    userId_tokenSymbol_eventId_outcomeId: {
                        userId: bot.id,
                        tokenSymbol: tokenSymbol,
                        eventId: event.id,
                        outcomeId: outcomeId || null as any // force null if undefined/empty
                    }
                },
                update: {
                    amount: { increment: shares }
                },
                create: {
                    userId: bot.id,
                    tokenSymbol: tokenSymbol,
                    eventId: event.id,
                    outcomeId: outcomeId || null,
                    amount: new prisma.Prisma.Decimal(shares),
                    locked: new prisma.Prisma.Decimal(0)
                }
            });

            // Update User Total Balance (Simulate spending)
            await tx.user.update({
                where: { id: bot.id },
                data: {
                    currentBalance: { decrement: amount },
                    totalDeposited: { increment: amount } // Fake deposit to keep balance positive maybe?
                }
            });
        });

        console.log(`[Cron] Simulated trade: ${bot.username} bought $${amount.toFixed(0)} of ${option} on "${event.title}"`);

        // Realtime trigger for the trade
        try {
            const { getPusherServer } = await import('@/lib/pusher-server');
            const pusherServer = getPusherServer();
            await pusherServer.trigger(`event-${event.id}`, 'odds-update', {
                type: 'TRADE',
                amount: amount,
                side: 'buy',
                username: bot.username,
                timestamp: Date.now()
            });
        } catch (e) { }

    } catch (err) {
        console.error('[Cron] Trade simulation failed:', err);
    }
}

// Extracted from original GET to keep things clean
async function generateComment() {
    // 1. Get a random active event
    const activeEventsCount = await prisma.event.count({ where: { status: 'ACTIVE' } });
    if (activeEventsCount === 0) return null;

    const skip = Math.floor(Math.random() * activeEventsCount);
    const activeEvents = await prisma.event.findMany({
        where: { status: 'ACTIVE' },
        include: {
            outcomes: true,
            messages: {
                where: { isDeleted: false },
                orderBy: { createdAt: 'desc' },
                take: 5
            }
        },
        take: 1,
        skip: skip
    });
    const event = activeEvents[0];

    // 2. Get random bot user
    const botUsersCount = await prisma.user.count({ where: { isBot: true } });
    if (botUsersCount === 0) return null;

    const skipBot = Math.floor(Math.random() * botUsersCount);
    const botUser = await prisma.user.findMany({
        where: { isBot: true },
        take: 1,
        skip: skipBot
    });
    const user = botUser[0];

    // 3. Decide if this is a new comment or a reply
    const recentMessages = event.messages;
    const isReply = recentMessages.length > 0 && Math.random() > 0.6;
    const parentMessage = isReply ? recentMessages[Math.floor(Math.random() * recentMessages.length)] : null;

    // 4. Prepare context for LLM
    const outcomesStr = event.outcomes.map((o: any) => `${o.name} (${Math.round((o.probability || 0) * 100)}%)`).join(', ');

    let prompt = `
 You are a realistic user on a crypto prediction market platform (like Polymarket).
 Market: "${event.title}"
 Description: "${event.description}"
 Current Odds/Probabilities: ${outcomesStr}
 Your Persona: "${user.username}"
 
 Guidelines:
 - Tone: Use crypto/betting culture slang (degens, bags, rekt, mooning, alpha, etc). Be concise.
 - Imperfections: lowercase, no punctuation, or minor typos are expected to look like a real person typing on mobile.
 - VARIETY: Don't always say the same thing. Sometimes be very short ("easy yes"), sometimes more descriptive with strong opinion.
 - No hashtags!!
 - Vary different behaviors, try to be bullish, bearish, skeptical, or just regular banter or offensive.
 `;

    if (isReply && parentMessage) {
        prompt += `
 You are replying to this message: "${parentMessage.text}"
 Your goal: Write a realistic response. You can offend, agree, disagree, or just post an emoji and a short take.
 `;
    } else {
        prompt += `
 Your goal: Write a new comment or observation about this market.
 `;
    }

    prompt += `\nRequirement: Return ONLY the text of the comment. No quotes, no preamble.`;

    const commentText = await promptLLM(prompt, {
        operation: 'generate_comment',
        temperature: 1.0,
        maxTokens: 80
    });

    if (!commentText) return null;
    const finalComment = commentText.trim();

    // 5. Insert into database
    const message = await prisma.message.create({
        data: {
            text: finalComment,
            userId: user.id,
            eventId: event.id,
            parentId: parentMessage?.id,
            createdAt: new Date()
        },
        include: {
            user: {
                select: {
                    username: true,
                    avatarUrl: true,
                    image: true,
                    address: true
                }
            }
        }
    });

    // 6. Handle Notifications
    if (parentMessage && parentMessage.userId !== user.id) {
        await prisma.notification.create({
            data: {
                userId: parentMessage.userId,
                type: 'REPLY',
                message: `${user.username || 'Someone'} replied to your message`,
                resourceId: event.id
            }
        }).catch((err: any) => { });
    }

    // 7. Publish to real-time
    try {
        const { getPusherServer } = await import('@/lib/pusher-server');
        const pusherServer = getPusherServer();
        const messagePayload = {
            eventId: event.id,
            message: {
                id: message.id,
                text: message.text,
                userId: message.userId,
                username: message.user.username,
                avatarUrl: message.user.avatarUrl || message.user.image,
                address: message.user.address,
                createdAt: message.createdAt,
                parentId: message.parentId,
                reactions: {}
            }
        };
        await pusherServer.trigger(`event-${event.id}`, 'chat-message', messagePayload);
    } catch (err: any) { }

    // 8. Invalidate cache
    try {
        const { invalidatePattern } = await import('@/lib/cache');
        await invalidatePattern(`${event.id}:messages:*`);
    } catch (err: any) { }

    return { event: event.title, user: user.username, comment: finalComment };
}

export async function GET(req: NextRequest) {
    // Basic security check
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[Cron] Starting job...');

        // 1. Generate Comment (Existing Logic)
        const commentResult = await generateComment();

        // 2. Simulate Trading Activity (New Logic)
        // Run 2 random trades per cron tick
        await simulateTrade();
        await simulateTrade();

        return NextResponse.json({
            success: true,
            comment: commentResult,
            message: 'Cron job completed'
        });

    } catch (error) {
        console.error('[Cron] Script failed:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
