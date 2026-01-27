import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { promptLLM } from '@/lib/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow enough time for LLM generation

// Reusable trade logic
async function executeBotTrade(user: any, event: any) {
    try {
        // 3. Pick an outcome
        let outcomeId: string | null = null;
        let option = 'YES';
        let price = 0.5;

        if (event.outcomes.length > 0) {
            const randomOutcome = event.outcomes[Math.floor(Math.random() * event.outcomes.length)];
            outcomeId = randomOutcome.id;
            if (event.type === 'BINARY') {
                option = Math.random() > 0.5 ? 'YES' : 'NO';
                price = option === 'YES' ? (event.yesOdds || 0.5) : (event.noOdds || 0.5);
            } else {
                option = randomOutcome.name;
                price = randomOutcome.probability || (1 / event.outcomes.length);
            }
        } else {
            option = Math.random() > 0.5 ? 'YES' : 'NO';
            price = 0.5;
        }

        // 4. Random amount $10 - $500
        const amount = 10 + Math.random() * 490;
        const shares = amount / Math.max(0.01, price);

        if (!Number.isFinite(amount) || !Number.isFinite(shares)) return;

        // 5. Create Order and MarketActivity
        await prisma.$transaction(async (tx: any) => {
            const order = await tx.order.create({
                data: {
                    userId: user.id,
                    eventId: event.id,
                    outcomeId: outcomeId,
                    option: option,
                    side: 'buy',
                    price: price,
                    amount: amount,
                    amountFilled: shares,
                    status: 'filled',
                    orderType: 'market',
                    visibleAmount: amount
                }
            });

            await tx.marketActivity.create({
                data: {
                    userId: user.id,
                    eventId: event.id,
                    type: 'TRADE',
                    side: 'buy',
                    option: option,
                    outcomeId: outcomeId,
                    amount: amount,
                    price: price,
                    isAmmInteraction: true,
                    orderId: order.id
                }
            });

            const tokenSymbol = outcomeId ? `OUT_${outcomeId}` : option;
            const balanceWhere = {
                userId: user.id,
                tokenSymbol: tokenSymbol,
                eventId: event.id,
                outcomeId: outcomeId || null
            };

            const existingBalance = await tx.balance.findFirst({ where: balanceWhere });

            if (existingBalance) {
                await tx.balance.update({
                    where: { id: existingBalance.id },
                    data: { amount: { increment: shares } }
                });
            } else {
                await tx.balance.create({
                    data: {
                        userId: user.id,
                        tokenSymbol: tokenSymbol,
                        eventId: event.id,
                        outcomeId: outcomeId || null,
                        amount: shares,
                        locked: 0
                    }
                });
            }

            await tx.user.update({
                where: { id: user.id },
                data: {
                    currentBalance: { decrement: amount },
                    totalDeposited: { increment: amount }
                }
            });
        });

        console.log(`[Cron] Executed trade: ${user.username} bought $${amount.toFixed(0)} of ${option}`);

        try {
            const { getPusherServer } = await import('@/lib/pusher-server');
            const pusherServer = getPusherServer();
            await pusherServer.trigger(`event-${event.id}`, 'odds-update', {
                type: 'TRADE',
                amount: amount,
                side: 'buy',
                username: user.username,
                timestamp: Date.now()
            });
        } catch (e) { }

    } catch (err) {
        console.error('[Cron] Trade execution failed:', err);
    }
}

// Deprecated: old random simulator
async function simulateTrade() {
    // Only kept if needed for legacy manual triggers
}

// Extracted from original GET to keep things clean
async function generateComment() {
    // 1. Get ALL active events (lightweight fetch for weighted selection)
    const allActiveEvents = await prisma.event.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, externalVolume: true }
    });

    if (allActiveEvents.length === 0) return null;

    // Weighted Random Selection based on volume
    const totalVolume = allActiveEvents.reduce((sum: number, e: any) => sum + (e.externalVolume || 0), 0);

    let selectedEventId = allActiveEvents[0].id;

    if (totalVolume > 0) {
        let r = Math.random() * totalVolume;
        for (const e of allActiveEvents) {
            r -= (e.externalVolume || 0);
            if (r <= 0) {
                selectedEventId = e.id;
                break;
            }
        }
    } else {
        // Fallback to pure random if no volume
        selectedEventId = allActiveEvents[Math.floor(Math.random() * allActiveEvents.length)].id;
    }

    // 2. Fetch full details for the selected event only
    const event = await prisma.event.findUnique({
        where: { id: selectedEventId },
        include: {
            outcomes: true,
            messages: {
                where: { isDeleted: false },
                orderBy: { createdAt: 'desc' },
                take: 5,
                include: { user: { select: { username: true } } }
            }
        }
    });

    if (!event) return null;

    // 2. Get random bot user
    const botUsersCount = await prisma.user.count({ where: { isBot: true } });
    if (botUsersCount === 0) return null;

    const skipBot = Math.floor(Math.random() * botUsersCount);
    const user = await prisma.user.findFirst({
        where: { isBot: true },
        skip: skipBot,
        orderBy: { id: 'asc' }
    });

    if (!user) return null;

    // ** NEW: Execute Trade with 60% Probability BEFORE generating comment **
    if (Math.random() < 0.60) {
        await executeBotTrade(user, event);
    }

    // 3. Decide if this is a new comment or a reply
    const recentMessages = event.messages;
    const isReply = recentMessages.length > 0 && Math.random() > 0.6;
    const parentMessage = isReply ? recentMessages[Math.floor(Math.random() * recentMessages.length)] : null;

    // 3a. Get Historical Context (Price Trend)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const historicalOdds = await prisma.oddsHistory.findMany({
        where: {
            eventId: event.id,
            timestamp: {
                gte: twentyFourHoursAgo
            }
        },
        orderBy: { timestamp: 'asc' }, // Get oldest record in range (closest to 24h ago)
        take: 10 // Get a few to map by outcome
    });

    // Map historical prices by outcome ID
    const historyMap = new Map<string, number>();
    historicalOdds.forEach((h: any) => {
        if (!historyMap.has(h.outcomeId)) {
            historyMap.set(h.outcomeId, h.probability);
        }
    });

    // 4. Prepare context for LLM with Trend
    const outcomesStr = event.outcomes.map((o: any) => {
        const currentProb = o.probability || 0;
        const oldProb = historyMap.get(o.id);

        let trendInfo = "";
        if (oldProb !== undefined) {
            const diff = currentProb - oldProb;
            const pctChange = (diff / Math.max(oldProb, 0.01)) * 100;

            if (pctChange > 5) trendInfo = ` (Tier: 🚀 UP ${pctChange.toFixed(0)}% in 24h)`;
            else if (pctChange < -5) trendInfo = ` (Tier: 🔻 DOWN ${Math.abs(pctChange).toFixed(0)}% in 24h)`;
            else trendInfo = ` (Stable)`;
        }

        return `${o.name} (${Math.round(currentProb * 100)}%)${trendInfo}`;
    }).join(', ');

    // 3b. Check Holdings (Skin in the Game)
    const userBalance = await prisma.balance.findFirst({
        where: {
            userId: user.id,
            eventId: event.id,
            amount: { gt: 5 } // Ignore dust (< 5 shares)
        },
        orderBy: { amount: 'desc' }
    });
    console.log('[Cron] Balance check complete for', user.username);

    const commentStyles = [
        "STYLE: BULLISH MAXI. You are absolutely convinced this outcome is winning. Be arrogant, use terms like 'free money', 'guaranteed', 'ez'.",
        "STYLE: BEARISH SKEPTIC. You think this is a bad bet. Call it a 'trap', 'scam', or 'rug'. Tell people to save their money.",
        "STYLE: DEGEN GAMBLER. You don't care about facts, you just want action. 'Just ape in', 'yolo', 'betting the house'.",
        "STYLE: ANALYST. Pretend to analyze the market structure. Mention 'volume', 'resistance', 'trend' vaguely. Sound smart but maybe be nonsense.",
        "STYLE: LAZY MINIMALIST. You assume everyone is an idiot. Use 1-3 words. lowercase. 'clown market', 'no', 'boring', 'mid'.",
        "STYLE: EMOTIONAL HYPE. ALL CAPS or lots of exclamation marks. You are very excited or very scared. 'OMFG', 'LFG', 'PANIC'.",
        "STYLE: TROLL. Mock the market concept or other users. Be sarcastic. 'Imagine betting on this', 'cope harder'.",
        "STYLE: CONFUSED NEWBIE. You don't understand how this market works. 'Wait so if it hits $1 does it resolve?', 'how do i sell?'.",
        "STYLE: INSIDER. Claim to have private info. 'My sources say', 'Trust me bro', 'Insiders dumping'.",
        "STYLE: NEWS AGGREGATOR. Just state a relevant-sounding fact or rumor as if it settles it. 'Did you see the latest tweet?', 'News just dropped'.",
        "STYLE: WHALE WATCHER. You are obsessed with large trades. 'Someone just loaded up on No', 'Whale alert!', 'Follow the smart money'.",
        "STYLE: CONSPIRACY THEORIST. The market is rigged. 'Devs are dumping', 'They control the outcome', 'It's a setup'.",
        "STYLE: BAG HOLDER. You are losing money but pretending to be fine. 'I'm not selling!', 'Diamond hands', 'Dip before the rip'.",
        "STYLE: COUNTER-TRADER. You always bet against the crowd. 'Inverse signal', 'Everyone is bullish so I'm shorting', 'Top signal'.",
        "STYLE: POLITICAL PARTISAN. (If applicable to the topic) highly biased. 'They will never let him win', 'Rigged election', 'Landslide incoming'.",
        "STYLE: MATH NERD. Quote specific probabilities. 'EV is negative here', 'Implied odds are wrong', 'Arbitrage opportunity here'.",
        "STYLE: FOMO VICTIM. You missed the good price. 'Is it too late?', 'Waiting for a dip', 'I sold too early fml'.",
        "STYLE: PHILOSOPHER. Make a deep but potentially irrelevant observation. 'Markets are just psychology', 'We are all just gambling on entropy'.",
        "STYLE: BOT ACCUSER. You think everyone else is a bot. 'Dead internet', 'All bots here', 'Beep boop'.",
        "STYLE: EMOJI SPAMMER. Use mostly emojis to convey sentiment. Rockets, skulls, graphs, clowns."
    ];

    const replyStyles = [
        "STYLE: AGREEMENT. You agree 100%. 'Based', 'Facts', 'This.', 'Real'.",
        "STYLE: MOCKING DISAGREEMENT. You think the OP is stupid. 'L take', 'clown', 'ratio', 'ngmi'.",
        "STYLE: SKEPTICAL. You doubt what they said. 'Source?', 'Proof?', 'Cap', 'You wish'.",
        "STYLE: LAUGHING. You just find it funny. 'Lmao', 'lol', 'dead', emojis.",
        "STYLE: DISMISSIVE. You don't care. 'Who asked?', 'Irrelevant', 'Cope'.",
        "STYLE: CORRECTOR. Correct a minor detail in their logic significantly. 'Actually...', 'You forgot about X'.",
        "STYLE: GIF REACTOR. (Describe a reaction gif textually). '*facepalm*', '*stares in confusion*', 'skull emoji'.",
        "STYLE: CHILL GUY. Tell them to relax. 'It's not that deep', 'Touch grass', 'Why so serious?'.",
        "STYLE: PARTNER. Suggest they are on the same team. 'WAGMI', 'We ride at dawn', 'Hold the line brother'.",
        "STYLE: QUESTIONER. Ask a follow up question. 'Why do you think that?', 'What price did you get in?', 'Bet?'."
    ];

    // Helper for consistency: Deterministically pick a style based on User ID
    const getDeterministicIndex = (str: string, max: number) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash) % max;
    };

    let selectedStyle = "";
    let portfolioContext = "You have no positions in this market. You are a neutral observer.";

    if (isReply && parentMessage) {
        // Use user.id + "reply" so their reply persona is consistent but distinct from their OP persona if needed
        const idx = getDeterministicIndex(user.id + "reply", replyStyles.length);
        selectedStyle = replyStyles[idx];
    } else {
        // Base selection
        let pool = commentStyles;

        // SKIN IN THE GAME CHECK
        if (userBalance) {
            let holdingName = userBalance.tokenSymbol;
            if (userBalance.outcomeId) {
                const outcome = event.outcomes.find((o: any) => o.id === userBalance.outcomeId);
                if (outcome) holdingName = outcome.name;
            }

            const amount = Math.round(Number(userBalance.amount));
            portfolioContext = `YOUR PORTFOLIO: You possess ${amount} shares of "${holdingName}". You are financially incentivized to have this outcome win.`;

            // (Filtered logic removed)

            // No filtering - let the prompt handle the conflict between Persona and Portfolio.
            // This allows for "Bullish Skeptics" (hedgers) or "Bearish Maxis", which is more realistic.
        }

        const idx = getDeterministicIndex(user.id, pool.length);
        selectedStyle = pool[idx];
    }

    // Append portfolio context to prompt if relevant
    // (We will add it in the prompt construction below)

    let prompt = `
 You are a realistic user on a crypto prediction market platform (like Polymarket).
 Market: "${event.title}"
 Description: "${event.description}"
 Current Odds/Probabilities: ${outcomesStr}
 Your Persona: "${user.username}"
 ${portfolioContext}

 Guidelines:
 - Tone: Use crypto/betting culture slang. Be concise.
 - Imperfections: lowercase, no punctuation, or minor typos are expected to look like a real person typing on mobile.
 - No hashtags!!
 - YOUR ASSIGNED BEHAVIOR: ${selectedStyle}
 `;

    // Randomize Tone and Imperfections for variety
    const tones = [
        "Aggressive", "Passionate", "Detached/Cool", "Sarcastic",
        "Desperate", "Euphoric", "Analytical", "Confused", "Lazy", "Hyper"
    ];
    const pickedTone = tones[Math.floor(Math.random() * tones.length)];

    const imperfections = [
        "USE ALL LOWERCASE. No punctuation.",
        "Use perfect grammar but very short sentences.",
        "Make 1-2 minor typos (e.g., 'teh', 'cuz', 'wont').",
        "Use excessive exclamation marks!!!!",
        "Use no punctuation at all run on sentences are fine",
        "Use internet slang heavily (fr, ngl, tbh, rn).",
        "Write in fragments. Not full sentences.",
        "Use all caps (SHOUTING)."
    ];
    let pickedImperfection = imperfections[Math.floor(Math.random() * imperfections.length)];

    // Force stricter adherence to imperfections
    if (pickedTone === "Lazy") pickedImperfection = "USE ALL LOWERCASE. No punctuation. minimal words.";
    if (pickedTone === "Aggressive") pickedImperfection = "Use excessive caps or exclamation points.";

    const sharedInstructions = `
 CRITICAL INSTRUCTIONS FOR REALISM:
 1. TONE: ${pickedTone}. match this tone exactly.
 2. STYLE: ${selectedStyle}
 3. IMPERFECTIONS: ${pickedImperfection}
 4. Length: Keep it short (under 280 characters like a tweet).
 5. Content: Be specific to the market odds or trend. Don't be generic.
 `;

    if (isReply && parentMessage) {
        prompt += `
 You are replying to this message: "${parentMessage.text}"
 Your goal: Write a realistic REPLY based on your assigned behavior style.
 Context: You are replying to user "${parentMessage.user.username}". React purely to their take.
 ${sharedInstructions}
 `;
    } else {
        prompt += `
 Your goal: Write a new comment or observation about this market based on your assigned behavior style.
 ${sharedInstructions}
 `;
    }

    prompt += `\nRequirement: Return ONLY the text of the comment on english language. No quotes, no preamble.`;

    const commentText = await promptLLM(prompt, {
        operation: 'generate_comment',
        temperature: 0.8,
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
                username: message.user?.username || 'User',
                avatarUrl: message.user?.avatarUrl || message.user?.image || '',
                address: message.user?.address || '',
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

async function simulateReaction() {
    try {
        // 1. Pick a random active event with messages
        // Include reactions to calculate "virality" weight
        const events = await prisma.event.findMany({
            where: { status: 'ACTIVE' },
            include: {
                messages: {
                    take: 50, // Look at more history 
                    orderBy: { createdAt: 'desc' },
                    include: {
                        reactions: { select: { type: true } }
                    }
                }
            },
            take: 10
        });
        if (events.length === 0) return;

        // Weighted event selection (reuse volume logic or just random for now? Random for reaction spread is fine)
        const randomEvent = events[Math.floor(Math.random() * events.length)];
        if (randomEvent.messages.length === 0) return;

        // 2. "Rich Get Richer" Selection Algorithm
        // We want a Pareto distribution: specific comments should snowball likes.
        // Weight = Base(1) + (ExistingReactions^2)
        // This gives massive preference to messages that already have traction.

        const weightedMessages = randomEvent.messages.map((msg: any) => {
            const reactionCount = msg.reactions.length;
            // High exponent (2.5) ensures extreme favoritism for popular comments
            const weight = 1 + Math.pow(reactionCount, 2.5);
            return { msg, weight };
        });

        const totalWeight = weightedMessages.reduce((sum: number, item: any) => sum + item.weight, 0);

        let randomMessage = weightedMessages[0].msg;
        if (totalWeight > 0) {
            let r = Math.random() * totalWeight;
            for (const item of weightedMessages) {
                r -= item.weight;
                if (r <= 0) {
                    randomMessage = item.msg;
                    break;
                }
            }
        }

        // 3. Pick a random bot
        const botCount = await prisma.user.count({ where: { isBot: true } });
        if (botCount === 0) return;
        const skipBot = Math.floor(Math.random() * botCount);
        const bot = await prisma.user.findFirst({ where: { isBot: true }, skip: skipBot });

        if (!bot) return;

        // Prevent self-reaction
        if (bot.id === randomMessage.userId) return;

        // Check if already reacted
        const existingReaction = await prisma.messageReaction.findUnique({
            where: {
                userId_messageId: {
                    userId: bot.id,
                    messageId: randomMessage.id
                }
            }
        });

        if (existingReaction) return; // Don't toggle, just skip if already reacted

        // 4. Determine Reaction Type
        // If the message is popular (lots of existing likes), likely to get MORE likes.
        // If mixed, maybe controversial.
        // Simple heuristic: 90% chance to follow the crowd (majority reaction type), 10% contrarian.

        let type = 'LIKE';
        const likes = randomMessage.reactions.filter((r: any) => r.type === 'LIKE').length;
        const dislikes = randomMessage.reactions.filter((r: any) => r.type === 'DISLIKE').length;
        const totalReactions = likes + dislikes;

        if (totalReactions > 0) {
            const likeRatio = likes / totalReactions;
            // If mostly likes, 90% chance to LIKE.
            // If mostly dislikes, 90% chance to DISLIKE.
            const trendReview = Math.random() < 0.90;
            if (trendReview) {
                type = likeRatio >= 0.5 ? 'LIKE' : 'DISLIKE';
            } else {
                type = likeRatio >= 0.5 ? 'DISLIKE' : 'LIKE';
            }
        } else {
            // New message (0 reactions): 85% chance to be positive initiation
            type = Math.random() > 0.15 ? 'LIKE' : 'DISLIKE';
        }

        await prisma.messageReaction.create({
            data: {
                userId: bot.id,
                messageId: randomMessage.id,
                type: type
            }
        });

        console.log(`[Cron] Bot ${bot.username} ${type}D message "${randomMessage.text.substring(0, 20)}..." (Total: ${totalReactions + 1})`);

    } catch (e) {
        console.error('[Cron] Reaction simulation failed:', e);
    }
}

export async function GET(req: NextRequest) {
    // Basic security check
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[Cron] Starting job (v2 - externalVolume)...');

        // 1. Generate Comment AND Trade (Combined Logic)
        const commentResult = await generateComment();

        // 2. Simulate trading calls REMOVED - trading is now part of generateComment.

        // 3. Simulate Reactions (Keep this for liveliness)
        await simulateReaction();
        await simulateReaction();
        await simulateReaction();

        return NextResponse.json({
            success: true,
            comment: commentResult,
            message: 'Cron job completed with synchronized trading'
        });

    } catch (error) {
        console.error('[Cron] Script failed:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
