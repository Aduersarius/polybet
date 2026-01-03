import 'dotenv/config';
import { calculateLMSROdds, calculateTokensForCost } from '../../lib/amm';
import { placeHybridOrder, resolveMarket } from '../../lib/hybrid-trading';
const AMM_BOT_USER_ID = process.env.AMM_BOT_USER_ID || 'cminhk477000002s8jld69y1f';

type Outcome = 'YES' | 'NO';

interface AppSimConfig {
    seeds: number;
    seedStart: number;
    bets: number;
    users: number;
    minStake: number;
    maxStake: number;
    biasToPrice: number;
    useDb: boolean;
    eventId?: string;
    bOverride?: number;
    resolveMode: 'random' | 'both' | Outcome;
    verbose: boolean;
    platformFee: number; // e.g., 0.02
    mode: 'amm' | 'hybrid' | 'api';
    dbWrite: boolean;
    resolveDb: boolean;
    apiUrl?: string;
    authToken?: string;
    authCookie?: string;
    maxLiquidityPct?: number; // e.g., 5 means 5% of liquidity cap
    liqFloor?: number; // minimum liquidity used for sizing (for thin books)
}

interface MarketSnapshot {
    qYes: number;
    qNo: number;
    b: number;
    label: string;
}

interface Positions {
    YES: number;
    NO: number;
}

interface RunResult {
    seed: number;
    resolve: Outcome;
    totalStake: number;
    profitIfYes: number;
    profitIfNo: number;
    worstCaseProfit: number;
    realizedProfit: number;
    finalYesPrice: number;
    yesBets: number;
    noBets: number;
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function createRng(seed: number) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function sampleStake(rng: () => number, min: number, max: number) {
    const logMin = Math.log(min);
    const logMax = Math.log(max);
    return Math.exp(logMin + rng() * (logMax - logMin));
}

async function loadMarket(config: AppSimConfig, prisma?: any): Promise<MarketSnapshot> {
    if (prisma && config.eventId) {
        try {
            // Try by ID first
            let event = await prisma.event.findUnique({
                where: { id: config.eventId },
                select: {
                    id: true,
                    title: true,
                    liquidityParameter: true,
                    qYes: true,
                    qNo: true,
                    status: true,
                },
            });

            // Fallback: try a loose title match if not found
            if (!event) {
                event = await prisma.event.findFirst({
                    where: {
                        OR: [
                            { title: { equals: config.eventId, mode: 'insensitive' } },
                            { title: { contains: config.eventId, mode: 'insensitive' } },
                        ],
                    },
                    select: {
                        id: true,
                        title: true,
                        liquidityParameter: true,
                        qYes: true,
                        qNo: true,
                        status: true,
                    },
                });
            }

            if (event) {
                const b = config.bOverride ?? event.liquidityParameter ?? 10000;
                const label = `${event.title} (${event.id}) [${event.status}]`;
                if (event.status && event.status !== 'ACTIVE') {
                    console.warn(`[simulate-app] Event status is ${event.status}; continuing but prices may be stale.`);
                }
                return {
                    qYes: event.qYes || 0,
                    qNo: event.qNo || 0,
                    b,
                    label,
                };
            } else {
                console.warn(`[simulate-app] Event not found for "${config.eventId}", using synthetic market.`);
            }
        } catch (err) {
            console.warn('[simulate-app] DB fetch failed; using synthetic market:', (err as Error).message);
        }
    }

    return {
        qYes: 0,
        qNo: 0,
        b: config.bOverride ?? 10000,
        label: 'synthetic (no DB)',
    };
}

function simulateAmm(seed: number, base: MarketSnapshot, config: AppSimConfig): RunResult {
    const rng = createRng(seed);
    let qYes = base.qYes;
    let qNo = base.qNo;
    const b = base.b;
    const fee = config.platformFee;

    const positions: Record<number, Positions> = {};
    for (let i = 0; i < config.users; i++) {
        positions[i] = { YES: 0, NO: 0 };
    }

    let totalStake = 0;
    let yesBets = 0;
    let noBets = 0;

    for (let i = 0; i < config.bets; i++) {
        const stake = sampleStake(rng, config.minStake, config.maxStake);
        const odds = calculateLMSROdds(qYes, qNo, b);
        const probYes = clamp(config.biasToPrice * odds.yesPrice + (1 - config.biasToPrice) * 0.5, 0.02, 0.98);
        const side: Outcome = rng() < probYes ? 'YES' : 'NO';

        const tokens = calculateTokensForCost(qYes, qNo, stake, side, b);
        if (!Number.isFinite(tokens) || tokens <= 0) {
            if (config.verbose) console.warn(`[simulate-app] Seed ${seed} bet ${i} invalid token calc; skipping`);
            continue;
        }

        const userId = Math.floor(rng() * config.users);
        positions[userId][side] += tokens;

        if (side === 'YES') {
            qYes += tokens;
            yesBets += 1;
        } else {
            qNo += tokens;
            noBets += 1;
        }

        totalStake += stake;

        if (config.verbose && i < 5) {
            const newOdds = calculateLMSROdds(qYes, qNo, b);
            console.log(`[seed ${seed} bet ${i + 1}] user ${userId} ${side} stake=${stake.toFixed(2)} tokens=${tokens.toFixed(4)} yesPrice=${newOdds.yesPrice.toFixed(4)}`);
        }
    }

    const payoutYes = Object.values(positions).reduce((s, p) => s + p.YES, 0);
    const payoutNo = Object.values(positions).reduce((s, p) => s + p.NO, 0);

    const profitIfYes = totalStake - payoutYes * (1 - fee);
    const profitIfNo = totalStake - payoutNo * (1 - fee);
    const worstCaseProfit = Math.min(profitIfYes, profitIfNo);

    const resolvedOutcome: Outcome =
        config.resolveMode === 'random'
            ? (createRng(seed + 9999)() < 0.5 ? 'YES' : 'NO')
            : config.resolveMode === 'both'
                ? 'YES' // placeholder; caller handles both branches separately
                : config.resolveMode;

    const realizedProfit = resolvedOutcome === 'YES' ? profitIfYes : profitIfNo;
    const finalYesPrice = calculateLMSROdds(qYes, qNo, b).yesPrice;

    return {
        seed,
        resolve: resolvedOutcome,
        totalStake,
        profitIfYes,
        profitIfNo,
        worstCaseProfit,
        realizedProfit,
        finalYesPrice,
        yesBets,
        noBets,
    };
}

// --- API (HTTP) EXECUTION ---
async function fetchEventState(config: AppSimConfig, prisma?: any): Promise<{ qYes: number; qNo: number; b: number }> {
    if (config.useDb && prisma && config.eventId) {
        const event = await prisma.event.findUnique({ where: { id: config.eventId } });
        if (event) {
            return { qYes: event.qYes || 0, qNo: event.qNo || 0, b: event.liquidityParameter || 10000 };
        }
    }
    if (config.apiUrl && config.eventId) {
        try {
            const res = await fetch(`${config.apiUrl}/api/events/${config.eventId}`, {
                method: 'GET',
                headers: { 'content-type': 'application/json' },
            });
            if (res.ok) {
                const data = await res.json();
                return {
                    qYes: data.qYes ?? 0,
                    qNo: data.qNo ?? 0,
                    b: data.liquidityParameter ?? 10000,
                };
            }
        } catch (err) {
            console.warn('[simulate-app api] Failed to fetch event state via api:', (err as Error).message);
        }
    }
    return { qYes: 0, qNo: 0, b: config.bOverride ?? 10000 };
}

async function simulateApi(seed: number, config: AppSimConfig, eventId: string, prisma?: any): Promise<RunResult> {
    if (!config.apiUrl) {
        throw new Error('API mode requires --api-url');
    }
    const rng = createRng(seed);
    let totalStake = 0;
    let yesBets = 0;
    let noBets = 0;

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (config.authToken) headers['authorization'] = `Bearer ${config.authToken}`;
    if (config.authCookie) headers['cookie'] = config.authCookie;

    for (let i = 0; i < config.bets; i++) {
        const stake = sampleStake(rng, config.minStake, config.maxStake);
        const sideOutcome: Outcome = rng() < 0.5 ? 'YES' : 'NO';
        try {
            const res = await fetch(`${config.apiUrl}/api/bets`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ eventId, outcome: sideOutcome, amount: stake }),
            });
            if (!res.ok) {
                if (config.verbose) console.warn(`[simulate-app api] bet ${i + 1} failed: ${res.status} ${res.statusText}`);
                continue;
            }
            totalStake += stake;
            sideOutcome === 'YES' ? yesBets++ : noBets++;
        } catch (err) {
            if (config.verbose) console.warn(`[simulate-app api] bet ${i + 1} error: ${(err as Error).message}`);
            continue;
        }
    }

    const { qYes, qNo, b } = await fetchEventState(config, prisma);

    const profitIfYes = totalStake - qYes * (1 - config.platformFee);
    const profitIfNo = totalStake - qNo * (1 - config.platformFee);
    const worstCaseProfit = Math.min(profitIfYes, profitIfNo);
    const resolvedOutcome: Outcome =
        config.resolveMode === 'random'
            ? (createRng(seed + 9999)() < 0.5 ? 'YES' : 'NO')
            : config.resolveMode === 'both'
                ? 'YES'
                : config.resolveMode;
    const realizedProfit = resolvedOutcome === 'YES' ? profitIfYes : profitIfNo;
    const finalYesPrice = calculateLMSROdds(qYes, qNo, b).yesPrice;

    return {
        seed,
        resolve: resolvedOutcome,
        totalStake,
        profitIfYes,
        profitIfNo,
        worstCaseProfit,
        realizedProfit,
        finalYesPrice,
        yesBets,
        noBets,
    };
}

// --- HYBRID (DB) EXECUTION ---
async function ensureSimUsers(prisma: any, count: number, fund: number) {
    for (let i = 0; i < count; i++) {
        const id = `sim-user-${i + 1}`;
        await prisma.user.upsert({
            where: { id },
            create: { id, username: id, email: `${id}@example.com` },
            update: {},
        });
        // Fund TUSD
        const existing = await prisma.balance.findFirst({
            where: { userId: id, tokenSymbol: 'TUSD', eventId: null, outcomeId: null },
            select: { id: true },
        });
        if (existing) {
            await prisma.balance.update({
                where: { id: existing.id },
                data: { amount: { increment: fund } },
            });
        } else {
            await prisma.balance.create({
                data: { userId: id, tokenSymbol: 'TUSD', amount: fund, eventId: null, outcomeId: null },
            });
        }
    }
}

async function ensureAmmBot(prisma: any, eventId: string, fund: number) {
    const ammId = AMM_BOT_USER_ID;
    await prisma.user.upsert({
        where: { id: ammId },
        create: { id: ammId, username: 'amm-bot', email: `amm-bot@example.com` },
        update: {},
    });
    const existingTusd = await prisma.balance.findFirst({
        where: { userId: ammId, tokenSymbol: 'TUSD', eventId: null, outcomeId: null },
        select: { id: true },
    });
    if (existingTusd) {
        await prisma.balance.update({
            where: { id: existingTusd.id },
            data: { amount: { increment: fund } },
        });
    } else {
        await prisma.balance.create({
            data: { userId: ammId, tokenSymbol: 'TUSD', amount: fund, eventId: null, outcomeId: null },
        });
    }
    // Ensure outcome balances exist to avoid missing rows
    const event = await prisma.event.findUnique({ where: { id: eventId }, include: { outcomes: true } });
    if (event?.type === 'MULTIPLE') {
        for (const outcome of event.outcomes) {
            const tokenSymbol = outcome.id;
            await prisma.balance.upsert({
                where: { userId_tokenSymbol_eventId_outcomeId: { userId: ammId, tokenSymbol, eventId, outcomeId: outcome.id } },
                create: { userId: ammId, tokenSymbol, amount: 0, eventId, outcomeId: outcome.id },
                update: {},
            });
        }
    } else {
        for (const option of ['YES', 'NO'] as Outcome[]) {
            const tokenSymbol = `${option}_${eventId}`;
            const existing = await prisma.balance.findFirst({
                where: { userId: ammId, tokenSymbol, eventId, outcomeId: null },
                select: { id: true },
            });
            if (existing) {
                // no-op, already exists
            } else {
                await prisma.balance.create({
                    data: { userId: ammId, tokenSymbol, amount: 0, eventId, outcomeId: null },
                });
            }
        }
    }
}

async function simulateHybrid(seed: number, config: AppSimConfig, eventId: string, prisma: any): Promise<RunResult> {
    const rng = createRng(seed);
    let totalStake = 0;
    let yesBets = 0;
    let noBets = 0;
    let failed = 0;
    let lastError: string | undefined;

    const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { outcomes: true }
    });
    if (!event) throw new Error(`Event ${eventId} not found`);
    const options: string[] = event.type === 'MULTIPLE'
        ? event.outcomes.map((o: any) => o.id)
        : ['YES', 'NO'];

    // Build liquidity map to cap bet size by percentage
    const liquidityMap: Record<string, number> = {};
    const floor = config.liqFloor ?? 0;
    if (event.type === 'MULTIPLE') {
        for (const o of event.outcomes) {
            const liq = o.liquidity || 0;
            liquidityMap[o.id] = Math.max(liq, floor);
        }
    } else {
        liquidityMap['YES'] = Math.max(event.qYes || 0, floor);
        liquidityMap['NO'] = Math.max(event.qNo || 0, floor);
    }
    const maxPct = config.maxLiquidityPct ?? 5; // default 5%

    for (let i = 0; i < config.bets; i++) {
        let stake = sampleStake(rng, config.minStake, config.maxStake);
        const pick = options[Math.floor(rng() * options.length)];
        const sideOutcome: Outcome = (pick === 'NO' || pick === 'YES') ? pick : pick as any;
        const userId = `sim-user-${(Math.floor(rng() * config.users) % config.users) + 1}`;

        // Cap stake to maxPct of liquidity for that outcome to satisfy RiskManager
        const liq = liquidityMap[pick] ?? 0;
        if (liq > 0) {
            const maxAllowed = (maxPct / 100) * liq;
            if (stake > maxAllowed) stake = Math.max(config.minStake, maxAllowed * 0.9);
            if (stake < config.minStake) {
                // Skip if even minStake is too high
                failed++;
                lastError = `Stake below min after cap for ${pick} (liq=${liq.toFixed(4)})`;
                if (config.verbose) console.warn(`[simulate-app hybrid] bet ${i + 1} skipped: ${lastError}`);
                continue;
            }
        }

        const result = await placeHybridOrder(userId, eventId, 'buy', sideOutcome, stake);
        if (!result.success) {
            failed++;
            lastError = result.error;
            if (config.verbose) console.warn(`[simulate-app hybrid] bet ${i + 1} failed: ${result.error}`);
            continue;
        }

        totalStake += stake;
        sideOutcome === 'YES' ? yesBets++ : noBets++;
    }

    // Compute current state for profit; fetch event
    const refreshed = await prisma.event.findUnique({ where: { id: eventId } });
    const qYes = refreshed?.qYes || 0;
    const qNo = refreshed?.qNo || 0;
    const payoutYes = qYes;
    const payoutNo = qNo;

    const profitIfYes = totalStake - payoutYes * (1 - config.platformFee);
    const profitIfNo = totalStake - payoutNo * (1 - config.platformFee);
    const worstCaseProfit = Math.min(profitIfYes, profitIfNo);
    const resolvedOutcome: Outcome =
        config.resolveMode === 'random'
            ? (createRng(seed + 9999)() < 0.5 ? 'YES' : 'NO')
            : config.resolveMode === 'both'
                ? 'YES'
                : config.resolveMode;
    const realizedProfit = resolvedOutcome === 'YES' ? profitIfYes : profitIfNo;
    const finalYesPrice = calculateLMSROdds(qYes, qNo, event?.liquidityParameter || 10000).yesPrice;

    return {
        seed,
        resolve: resolvedOutcome,
        totalStake,
        profitIfYes,
        profitIfNo,
        worstCaseProfit,
        realizedProfit,
        finalYesPrice,
        yesBets,
        noBets,
    };
}

function summarize(results: RunResult[]) {
    const stat = (arr: number[]) => ({
        avg: arr.reduce((s, v) => s + v, 0) / arr.length,
        min: Math.min(...arr),
        max: Math.max(...arr),
        negativePct: (arr.filter(v => v < 0).length / arr.length) * 100,
    });

    return {
        runs: results.length,
        realizedProfit: stat(results.map(r => r.realizedProfit)),
        worstCaseProfit: stat(results.map(r => r.worstCaseProfit)),
        profitIfYes: stat(results.map(r => r.profitIfYes)),
        profitIfNo: stat(results.map(r => r.profitIfNo)),
        finalYesPrice: stat(results.map(r => r.finalYesPrice)),
        yesSharePct: stat(results.map(r => r.yesBets / Math.max(1, r.yesBets + r.noBets))),
    };
}

function parseArgs(): AppSimConfig {
    const args = process.argv.slice(2);
    const num = (flag: string, fallback: number) => {
        const idx = args.indexOf(flag);
        if (idx !== -1 && args[idx + 1]) {
            const v = Number(args[idx + 1]);
            if (!Number.isNaN(v)) return v;
        }
        return fallback;
    };
    const str = (flag: string): string | undefined => {
        const idx = args.indexOf(flag);
        return idx !== -1 ? args[idx + 1] : undefined;
    };

    const resolve = (str('--resolve') as AppSimConfig['resolveMode']) || 'random';

    return {
        seeds: num('--seeds', 100),
        seedStart: num('--seed-start', 1),
        bets: num('--bets', 1000),
        users: num('--users', 50),
        minStake: num('--min', 5),
        maxStake: num('--max', 100),
        biasToPrice: clamp(num('--bias', 70) / 100, 0, 1),
        useDb: args.includes('--db'),
        eventId: str('--event'),
        bOverride: args.includes('--b') ? num('--b', 10000) : undefined,
        resolveMode: resolve,
        verbose: args.includes('--verbose'),
        platformFee: clamp(num('--fee', 2) / 100, 0, 1),
        mode: (str('--mode') as AppSimConfig['mode']) || 'amm',
        dbWrite: args.includes('--db-write'),
        resolveDb: args.includes('--resolve-db'),
        apiUrl: str('--api-url'),
        authToken: str('--auth-token'),
        authCookie: str('--auth-cookie'),
    };
}

async function main() {
    const config = parseArgs();
    let prisma: any = null;

    if (config.useDb) {
        try {
            ({ prisma } = await import('../../lib/prisma'));
        } catch (err) {
            console.warn('[simulate-app] Failed to init Prisma; continuing without DB:', (err as Error).message);
        }
    }

    const base = await loadMarket(config, prisma);
    const results: RunResult[] = [];

    if (config.mode === 'hybrid') {
        if (!prisma || !config.useDb || !config.eventId) {
            throw new Error('Hybrid mode requires --db --db-write and --event');
        }
        if (!config.dbWrite) {
            throw new Error('Hybrid mode mutates DB; pass --db-write to acknowledge.');
        }
        const eventId = (await prisma.event.findFirst({ where: { id: base.label.split('(')[1]?.split(')')[0] || config.eventId } }))?.id || config.eventId;
        await ensureSimUsers(prisma, config.users, 1_000_000);
        await ensureAmmBot(prisma, eventId, 1_000_000);

        for (let i = 0; i < config.seeds; i++) {
            const seed = config.seedStart + i;
            if (config.resolveMode === 'both') {
                results.push(await simulateHybrid(seed, config, eventId, prisma));
                results.push(await simulateHybrid(seed, { ...config, resolveMode: 'NO' }, eventId, prisma));
            } else {
                results.push(await simulateHybrid(seed, config, eventId, prisma));
            }
        }

        if (config.resolveDb) {
            const outcome = config.resolveMode === 'random'
                ? (createRng(config.seedStart + config.seeds + 9999)() < 0.5 ? 'YES' : 'NO')
                : (config.resolveMode === 'both' ? 'YES' : config.resolveMode);
            console.warn(`[simulate-app] Resolving event ${eventId} as ${outcome}`);
            await resolveMarket(eventId, outcome);
        }

    } else if (config.mode === 'api') {
        if (!config.eventId) throw new Error('API mode requires --event');
        for (let i = 0; i < config.seeds; i++) {
            const seed = config.seedStart + i;
            if (config.resolveMode === 'both') {
                results.push(await simulateApi(seed, { ...config, resolveMode: 'YES' }, config.eventId, prisma));
                results.push(await simulateApi(seed, { ...config, resolveMode: 'NO' }, config.eventId, prisma));
            } else {
                results.push(await simulateApi(seed, config, config.eventId, prisma));
            }
        }
    } else {
        for (let i = 0; i < config.seeds; i++) {
            const seed = config.seedStart + i;
            if (config.resolveMode === 'both') {
                results.push(simulateAmm(seed, base, { ...config, resolveMode: 'YES' }));
                results.push(simulateAmm(seed, base, { ...config, resolveMode: 'NO' }));
            } else {
                results.push(simulateAmm(seed, base, config));
            }
        }
    }

    const summary = summarize(results);
    console.log(JSON.stringify({ config, market: base, summary }, null, 2));

    if (prisma) await prisma.$disconnect();
}

main().catch(err => {
    console.error('[simulate-app] Failed:', err);
    process.exit(1);
});

