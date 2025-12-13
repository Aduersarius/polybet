import 'dotenv/config';
import { calculateLMSROdds, calculateTokensForCost } from '../lib/amm';

type Outcome = 'YES' | 'NO';

interface SimConfig {
    bets: number;
    minStake: number;
    maxStake: number;
    seed: number;
    eventId?: string;
    useDb: boolean;
    resolve: Outcome | 'random';
    biasToPrice: number;
    verbose: boolean;
}

interface MarketState {
    qYes: number;
    qNo: number;
    b: number;
    label: string;
}

interface ProfitSnapshot {
    totalStake: number;
    payoutIfYes: number;
    payoutIfNo: number;
    profitIfYes: number;
    profitIfNo: number;
    worstCaseProfit: number;
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function createRng(seed: number) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function parseArgs(): SimConfig {
    const args = process.argv.slice(2);
    const readNumber = (flag: string, fallback: number) => {
        const idx = args.indexOf(flag);
        if (idx !== -1 && args[idx + 1]) {
            const asNum = Number(args[idx + 1]);
            if (!Number.isNaN(asNum)) return asNum;
        }
        return fallback;
    };
    const readString = (flag: string): string | undefined => {
        const idx = args.indexOf(flag);
        return idx !== -1 ? args[idx + 1] : undefined;
    };

    return {
        bets: readNumber('--bets', 1000),
        minStake: readNumber('--min', 5),
        maxStake: readNumber('--max', 100),
        seed: readNumber('--seed', 42),
        eventId: readString('--event'),
        useDb: !args.includes('--no-db'),
        resolve: (readString('--resolve') as SimConfig['resolve']) || 'random',
        biasToPrice: clamp(readNumber('--bias', 70) / 100, 0, 1), // % weight on current price when choosing side
        verbose: args.includes('--verbose'),
    };
}

async function loadMarketState(config: SimConfig, prisma?: any): Promise<MarketState> {
    if (prisma && config.eventId) {
        try {
            const event = await prisma.event.findUnique({
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

            if (event) {
                return {
                    qYes: event.qYes || 0,
                    qNo: event.qNo || 0,
                    b: event.liquidityParameter || 10000,
                    label: `${event.title} (${event.id}) [${event.status}]`,
                };
            }
        } catch (err) {
            console.warn('[simulate-bets] DB lookup failed, continuing with synthetic state:', (err as Error).message);
        }
    }

    return {
        qYes: 0,
        qNo: 0,
        b: 10000,
        label: 'synthetic (no DB)',
    };
}

function snapshotProfit(state: MarketState, totalStake: number): ProfitSnapshot {
    const payoutIfYes = state.qYes; // $1 per YES token
    const payoutIfNo = state.qNo;   // $1 per NO token
    const profitIfYes = totalStake - payoutIfYes;
    const profitIfNo = totalStake - payoutIfNo;
    const worstCaseProfit = Math.min(profitIfYes, profitIfNo);

    return {
        totalStake,
        payoutIfYes,
        payoutIfNo,
        profitIfYes,
        profitIfNo,
        worstCaseProfit,
    };
}

function sampleStake(rng: () => number, min: number, max: number) {
    const logMin = Math.log(min);
    const logMax = Math.log(max);
    return Math.exp(logMin + rng() * (logMax - logMin));
}

async function main() {
    const config = parseArgs();
    const rng = createRng(config.seed);
    let prisma: any = null;

    if (config.useDb) {
        try {
            ({ prisma } = await import('../lib/prisma'));
        } catch (err) {
            console.warn('[simulate-bets] Failed to init Prisma, continuing without DB:', (err as Error).message);
        }
    }

    const state = await loadMarketState(config, prisma);

    const stats = {
        yesBets: 0,
        noBets: 0,
        yesTokens: 0,
        noTokens: 0,
        totalStake: 0,
        avgYesPriceAccumulator: 0,
        minYesPrice: 1,
        maxYesPrice: 0,
    };

    console.log(`[simulate-bets] Starting simulation for ${config.bets} bets on ${state.label}`);

    for (let i = 0; i < config.bets; i++) {
        const stake = sampleStake(rng, config.minStake, config.maxStake);
        const odds = calculateLMSROdds(state.qYes, state.qNo, state.b);
        const probYes = clamp(config.biasToPrice * odds.yesPrice + (1 - config.biasToPrice) * 0.5, 0.02, 0.98);
        const side: Outcome = rng() < probYes ? 'YES' : 'NO';

        const tokens = calculateTokensForCost(state.qYes, state.qNo, stake, side, state.b);
        if (!Number.isFinite(tokens) || tokens <= 0) {
            console.warn(`[simulate-bets] Skipping bet ${i} due to invalid token calc`);
            continue;
        }

        if (side === 'YES') {
            state.qYes += tokens;
            stats.yesTokens += tokens;
            stats.yesBets += 1;
        } else {
            state.qNo += tokens;
            stats.noTokens += tokens;
            stats.noBets += 1;
        }

        stats.totalStake += stake;

        const newOdds = calculateLMSROdds(state.qYes, state.qNo, state.b);
        stats.avgYesPriceAccumulator += newOdds.yesPrice;
        stats.minYesPrice = Math.min(stats.minYesPrice, newOdds.yesPrice);
        stats.maxYesPrice = Math.max(stats.maxYesPrice, newOdds.yesPrice);

        if (config.verbose && i < 10) {
            console.log(
                `[bet ${i + 1}] ${side} stake=${stake.toFixed(2)} -> tokens=${tokens.toFixed(4)} | yesPrice=${newOdds.yesPrice.toFixed(4)} noPrice=${newOdds.noPrice.toFixed(4)}`
            );
        }
    }

    const finalOdds = calculateLMSROdds(state.qYes, state.qNo, state.b);
    const profit = snapshotProfit(state, stats.totalStake);
    const resolvedOutcome: Outcome =
        config.resolve === 'random' ? (rng() < 0.5 ? 'YES' : 'NO') : config.resolve;
    const realizedProfit = resolvedOutcome === 'YES' ? profit.profitIfYes : profit.profitIfNo;

    console.log('\n[simulate-bets] Results');
    console.log(JSON.stringify({
        inputs: {
            bets: config.bets,
            minStake: config.minStake,
            maxStake: config.maxStake,
            seed: config.seed,
            eventId: config.eventId ?? 'synthetic',
            liquidityParameter: state.b,
            resolve: resolvedOutcome,
        },
        betMix: {
            yesBets: stats.yesBets,
            noBets: stats.noBets,
            yesTokens: Number(stats.yesTokens.toFixed(4)),
            noTokens: Number(stats.noTokens.toFixed(4)),
        },
        pricing: {
            finalYesPrice: Number(finalOdds.yesPrice.toFixed(4)),
            finalNoPrice: Number(finalOdds.noPrice.toFixed(4)),
            minYesPrice: Number(stats.minYesPrice.toFixed(4)),
            maxYesPrice: Number(stats.maxYesPrice.toFixed(4)),
            avgYesPrice: Number((stats.avgYesPriceAccumulator / config.bets).toFixed(4)),
        },
        treasury: {
            totalStake: Number(stats.totalStake.toFixed(4)),
            payoutIfYes: Number(profit.payoutIfYes.toFixed(4)),
            payoutIfNo: Number(profit.payoutIfNo.toFixed(4)),
            profitIfYes: Number(profit.profitIfYes.toFixed(4)),
            profitIfNo: Number(profit.profitIfNo.toFixed(4)),
            worstCaseProfit: Number(profit.worstCaseProfit.toFixed(4)),
            realizedProfit: Number(realizedProfit.toFixed(4)),
        },
    }, null, 2));

    if (prisma) await prisma.$disconnect();
}

main().catch((err) => {
    console.error('[simulate-bets] Failed:', err);
    process.exit(1);
});

