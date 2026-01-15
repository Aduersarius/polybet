import { NextRequest, NextResponse } from 'next/server';
import { Wallet, ethers } from 'ethers';
import { polymarketTrading } from '@/lib/polymarket-trading';

// Prevent static generation
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        // Use the shared service which handles auto-derivation
        await polymarketTrading.ensureReady();

        // Access private wallet address if available (for display only)
        let walletAddress = 'Loading...';
        try {
            if (process.env.POLYMARKET_PRIVATE_KEY) {
                const wallet = new Wallet(process.env.POLYMARKET_PRIVATE_KEY);
                walletAddress = wallet.address;
            } else if (process.env.POLYMARKET_FUNDER_ADDRESS) {
                walletAddress = process.env.POLYMARKET_FUNDER_ADDRESS;
            }
        } catch (e) { }

        // Fetch open orders via service
        const openOrders = await polymarketTrading.getOpenOrders();

        // Fetch trades via service
        const trades = await polymarketTrading.getTrades();

        // Calculate positions from FILLED trades only (not pending orders)
        const positions: {
            [tokenId: string]: {
                shares: number;
                cost: number;
                avgPrice: number;
                tokenId: string;
                side: string;
                marketId?: string;
            }
        } = {};

        for (const trade of trades) {
            // Skip non-filled trades - trades with match_time have actually filled
            if (!trade.match_time) {
                continue;
            }

            const tokenId = trade.asset_id || trade.token_id;
            if (!tokenId) continue;

            const size = parseFloat(trade.size) || 0;
            const price = parseFloat(trade.price) || 0;

            if (!positions[tokenId]) {
                positions[tokenId] = {
                    shares: 0,
                    cost: 0,
                    avgPrice: 0,
                    tokenId,
                    side: 'LONG',
                    marketId: trade.market_id || trade.market
                };
            }

            if (trade.side === 'BUY') {
                positions[tokenId].shares += size;
                positions[tokenId].cost += size * price;
            } else {
                positions[tokenId].shares -= size;
                positions[tokenId].cost -= size * price;
            }
        }

        // Calculate avg price and filter out closed positions
        const openPositions = Object.values(positions)
            .filter(p => Math.abs(p.shares) > 0.001)
            .map(p => {
                const isLong = p.shares > 0;
                return {
                    ...p,
                    avgPrice: p.shares !== 0 ? p.cost / p.shares : 0,
                    side: isLong ? 'LONG' : 'SHORT',
                    shares: Math.abs(p.shares),
                };
            });

        // Fetch ACTUAL on-chain balances from Polygon blockchain
        if (process.env.POLYMARKET_PRIVATE_KEY) {
            console.log('[Admin Polymarket API] Fetching on-chain balances for positions...');
            const hedgeWallet = new Wallet(process.env.POLYMARKET_PRIVATE_KEY);

            // Conditional Tokens Framework contract on Polygon
            const CTF_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
            const CTF_ABI = [
                'function balanceOf(address account, uint256 id) view returns (uint256)'
            ];

            // Create provider for Polygon
            const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com');
            const ctfContract = new ethers.Contract(CTF_ADDRESS, CTF_ABI, provider);

            // Fetch real balances for each position
            for (const pos of openPositions) {
                try {
                    const balance = await ctfContract.balanceOf(hedgeWallet.address, pos.tokenId);
                    // FIX: Convert from raw units (6 decimals) to actual shares
                    const actualShares = parseFloat(ethers.formatUnits(balance, 6));
                    (pos as any).actualBalance = actualShares;

                    // Flag discrepancies between calculated and actual
                    const diff = Math.abs(actualShares - pos.shares);
                    if (diff > 0.01) {
                        console.warn(`[Admin Polymarket API] ⚠️ Balance mismatch for ${pos.tokenId.slice(-8)}: calculated=${pos.shares.toFixed(2)}, actual=${actualShares.toFixed(2)}`);
                        (pos as any).hasDiscrepancy = true;

                        // FIX: Correct the side based on actual balance
                        if (actualShares > 0 && pos.side === 'SHORT') {
                            console.warn(`[Admin Polymarket API] ⚠️ Correcting side from SHORT to LONG for ${pos.tokenId.slice(-8)}`);
                            (pos as any).side = 'LONG';
                        }
                    }
                } catch (e) {
                    console.error(`[Admin Polymarket API] Failed to fetch balance for ${pos.tokenId}:`, e);
                    (pos as any).actualBalance = null;
                }
            }
        }

        // Fetch market slugs for open positions
        try {
            await Promise.all(openPositions.map(async (pos) => {
                if (pos.marketId) {
                    try {
                        const market = await polymarketTrading.getMarket(pos.marketId);
                        if (market && (market as any).market_slug) {
                            pos.marketId = (market as any).market_slug;
                        }
                    } catch (e) {
                        console.error('Failed to fetch market slug for', pos.marketId, e);
                    }
                }
            }));
        } catch (e) {
            console.error('Error fetching market slugs', e);
        }

        // Fetch market slugs for recent trades (deduplicate to save API calls)
        try {
            const tradeMarkets = new Set(trades.slice(0, 20).map(t => t.market_id || t.market));
            const marketSlugMap = new Map<string, string>();

            await Promise.all(Array.from(tradeMarkets).map(async (marketId: any) => {
                if (!marketId) return;
                try {
                    const market = await polymarketTrading.getMarket(marketId);
                    if (market && (market as any).market_slug) {
                        marketSlugMap.set(marketId, (market as any).market_slug);
                    }
                } catch (e) {
                    console.error('Failed to fetch market slug for trade', marketId, e);
                }
            }));

            // Attach slugs to trades
            trades.forEach(t => {
                const mid = t.market_id || t.market;
                if (mid && marketSlugMap.has(mid)) {
                    (t as any).slug = marketSlugMap.get(mid);
                }
            });
        } catch (e) {
            console.error('Error fetching trade market slugs', e);
        }

        return NextResponse.json({
            wallet: walletAddress,
            openOrders: openOrders.map(o => ({
                id: o.id || o.orderID,
                tokenId: o.asset_id || o.token_id,
                side: o.side,
                price: o.price,
                size: o.size || o.original_size,
                filled: o.size_matched || 0,
                status: o.status,
                createdAt: o.created || o.timestamp,
            })),
            positions: openPositions,
            recentTrades: trades.slice(0, 20).map(t => ({
                id: t.id,
                tokenId: t.asset_id || t.token_id,
                marketId: (t as any).slug || t.market_id || t.market,
                side: t.side,
                price: t.price,
                size: t.size,
                status: t.status,
                timestamp: t.match_time
                    ? new Date(t.match_time * 1000).toISOString()
                    : (t.timestamp
                        ? (typeof t.timestamp === 'string' && t.timestamp.length > 10 ? new Date(parseInt(t.timestamp)).toISOString() : new Date(parseInt(t.timestamp) * 1000).toISOString())
                        : new Date().toISOString()),
            })),
        });
    } catch (error) {
        console.error('[Polymarket API] Error:', error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : 'Failed to fetch Polymarket data',
                wallet: null,
                openOrders: [],
                positions: [],
                recentTrades: [],
            },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const { tokenId, side, amount, marketSell } = await request.json();

        if (!tokenId || !side || !amount) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        console.log(`[Admin Polymarket API] ${marketSell ? 'Market selling' : 'Closing'} position: ${side} ${amount} shares of ${tokenId}`);

        await polymarketTrading.ensureReady();

        const orderSide = (side === 'LONG' || side === 'buy' || side === 'BUY') ? 'SELL' : 'BUY';

        let resp;
        if (marketSell) {
            // For Market Sell/Buy, use our optimized method which handles orderbook + aggressive pricing
            resp = await polymarketTrading.placeMarketOrder(
                '0', // marketId not strictly needed for placeMarketOrder as it resolves from token
                '0', // conditionId
                tokenId,
                orderSide as 'BUY' | 'SELL',
                parseFloat(amount)
            );
        } else {
            // Limit close - fetch orderbook to price appropriately
            const orderbook = await polymarketTrading.getOrderbook(tokenId);

            let price = orderSide === 'BUY' ? 0.99 : 0.01;

            if (orderSide === 'SELL' && orderbook.bids.length > 0) {
                // Sell at best bid - 1 cent to ensure fill
                price = Math.max(0.01, orderbook.bids[0].price - 0.01);
            } else if (orderSide === 'BUY' && orderbook.asks.length > 0) {
                // Buy at best ask + 1 cent
                price = Math.min(0.99, orderbook.asks[0].price + 0.01);
            }

            resp = await polymarketTrading.placeOrder({
                tokenId,
                side: orderSide as 'BUY' | 'SELL',
                size: parseFloat(amount),
                price: price,
                // Pass these if available to save calls
                marketId: '0',
                conditionId: '0'
            });
        }

        console.log(`[Admin Polymarket API] Close order placed:`, resp);

        return NextResponse.json({
            success: true,
            orderId: resp?.orderId || resp?.id,
            result: resp
        });
    } catch (error) {
        console.error('[Polymarket API] Error closing position:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to close position' },
            { status: 500 }
        );
    }
}
