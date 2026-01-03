import 'dotenv/config';
import { calculateLMSROdds, calculateTokensForCost } from '../../lib/amm';

type Outcome = 'YES' | 'NO';

interface BatchConfig {
    seeds: number;
    seedStart: number;
    bets: number;
    minStake: number;
    maxStake: number;
    biasToPrice: number;
    useDb: boolean;
    eventId?: string;
    resolveMode: 'random' | 'both' | Outcome;
    verbose: boolean;
}

interface MarketState {
    qYes: number;
    qNo: number;
    b: number;
    label: string;
}

interface RunResult {
    seed: number;
    resolve: Outcome;
    realizedProfit: number;
    profitIfYes: number;
    profitIfNo: number;
    worstCaseProfit: number;
    finalYesPrice: number;
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

async function loadMarketState(config: BatchConfig, prisma?: any): Promise<MarketState> {
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
            console.warn('[simulate-batch] DB lookup failed, using synthetic state:', (err as Error).message);
        }
    }

    return {
        qYes: 0,
        qNo: 0,
        b: 10000,
        label: 'synthetic (no DB)',
    };
}

function runSingleSimulation(seed: number, state: MarketState, config: BatchConfig): RunResult {
    const rng = createRng(seed);

    let qYes = state.qYes;
    let qNo = state.qNo;
    const b = state.b;

    let totalStake = 0;
    let minYesPrice = 1;
    let maxYesPrice = 0;
    let avgYesPriceAcc = 0;

    for (let i = 0; i < config.bets; i++) {
        const stake = sampleStake(rng, config.minStake, config.maxStake);
        const odds = calculateLMSROdds(qYes, qNo, b);
        const probYes = clamp(config.biasToPrice * odds.yesPrice + (1 - config.biasToPrice) * 0.5, 0.02, 0.98);
        const side: Outcome = rng() < probYes ? 'YES' : 'NO';

        const tokens = calculateTokensForCost(qYes, qNo, stake, side, b);
        if (!Number.isFinite(tokens) || tokens <= 0) continue;

        if (side === 'YES') qYes += tokens;
        else qNo += tokens;

        totalStake += stake;
        const newOdds = calculateLMSROdds(qYes, qNo, b);
        avgYesPriceAcc += newOdds.yesPrice;
        minYesPrice = Math.min(minYesPrice, newOdds.yesPrice);
        maxYesPrice = Math.max(maxYesPrice, newOdds.yesPrice);

        if (config.verbose && i < 3) {
            console.log(`[seed ${seed} bet ${i + 1}] ${side} stake=${stake.toFixed(2)} yesPrice=${newOdds.yesPrice.toFixed(4)}`);
        }
    }

    const finalOdds = calculateLMSROdds(qYes, qNo, b);
    const profitIfYes = totalStake - qYes;
    const profitIfNo = totalStake - qNo;
    const worstCaseProfit = Math.min(profitIfYes, profitIfNo);

    const resolvedOutcome: Outcome =
        config.resolveMode === 'random'
            ? (createRng(seed + 9999)() < 0.5 ? 'YES' : 'NO')
            : config.resolveMode === 'both'
                ? 'YES' // placeholder, handled by caller
                : config.resolveMode;

    const realizedProfit = resolvedOutcome === 'YES' ? profitIfYes : profitIfNo;

    return {
        seed,
        resolve: resolvedOutcome,
        realizedProfit,
        profitIfYes,
        profitIfNo,
        worstCaseProfit,
        finalYesPrice: finalOdds.yesPrice,
    };
}

function summarize(results: RunResult[]) {
    const nums = (arr: number[]) => ({
        avg: arr.reduce((s, v) => s + v, 0) / arr.length,
        min: Math.min(...arr),
        max: Math.max(...arr),
        negativePct: (arr.filter(v => v < 0).length / arr.length) * 100,
    });

    const realized = nums(results.map(r => r.realizedProfit));
    const worst = nums(results.map(r => r.worstCaseProfit));
    const finalPrice = nums(results.map(r => r.finalYesPrice));

    return {
        runs: results.length,
        realizedProfit: realized,
        worstCaseProfit: worst,
        finalYesPrice: finalPrice,
    };
}

function parseArgs(): BatchConfig {
    const args = process.argv.slice(2);
    const num = (flag: string, fallback: number) => {
        const idx = args.indexOf(flag);
        if (idx !== -1 && args[idx + 1]) {
            const val = Number(args[idx + 1]);
            if (!Number.isNaN(val)) return val;
        }
        return fallback;
    };
    const str = (flag: string): string | undefined => {
        const idx = args.indexOf(flag);
        return idx !== -1 ? args[idx + 1] : undefined;
    };

    const resolve = (str('--resolve') as BatchConfig['resolveMode']) || 'random';

    return {
        seeds: num('--seeds', 100),
        seedStart: num('--seed-start', 1),
        bets: num('--bets', 1000),
        minStake: num('--min', 5),
        maxStake: num('--max', 100),
        biasToPrice: clamp(num('--bias', 70) / 100, 0, 1),
        useDb: args.includes('--db'), // default off to avoid env issues
        eventId: str('--event'),
        resolveMode: resolve,
        verbose: args.includes('--verbose'),
    };
}

async function main() {
    const config = parseArgs();
    let prisma: any = null;

    if (config.useDb) {
        try {
            ({ prisma } = await import('../../lib/prisma'));
        } catch (err) {
            console.warn('[simulate-batch] Failed to init Prisma, continuing without DB:', (err as Error).message);
        }
    }

    const baseState = await loadMarketState(config, prisma);
    const results: RunResult[] = [];

    for (let i = 0; i < config.seeds; i++) {
        const seed = config.seedStart + i;
        if (config.resolveMode === 'both') {
            const yesRun = runSingleSimulation(seed, baseState, { ...config, resolveMode: 'YES' });
            const noRun = runSingleSimulation(seed, baseState, { ...config, resolveMode: 'NO' });
            results.push(yesRun, noRun);
        } else {
            results.push(runSingleSimulation(seed, baseState, config));
        }
    }

    const summary = summarize(results);
    console.log(JSON.stringify({ config, state: baseState, summary }, null, 2));

    if (prisma) await prisma.$disconnect();
}

main().catch(err => {
    console.error('[simulate-batch] Failed:', err);
    process.exit(1);
});

