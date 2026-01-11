import { NextRequest, NextResponse } from 'next/server';
import { Wallet } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';

// Function to wrap wallet for ethers v6 compatibility
function wrapWalletForV5Compat(wallet: Wallet): Wallet {
    const wrappedWallet = wallet as any;
    if (!wrappedWallet._signTypedData && wrappedWallet.signTypedData) {
        wrappedWallet._signTypedData = function (
            domain: any,
            types: any,
            value: any
        ): Promise<string> {
            return this.signTypedData(domain, types, value);
        };
    }
    return wrappedWallet as Wallet;
}

function getClobClient() {
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
    const apiKey = process.env.POLYMARKET_API_KEY;
    const apiSecret = process.env.POLYMARKET_API_SECRET;
    const passphrase = process.env.POLYMARKET_PASSPHRASE;
    const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS;

    if (!privateKey || !apiKey || !apiSecret || !passphrase) {
        throw new Error('Polymarket credentials not configured');
    }

    const rawWallet = new Wallet(privateKey);
    const wallet = wrapWalletForV5Compat(rawWallet);

    // Sanitize secret
    let sanitizedSecret = apiSecret.replace(/-/g, '+').replace(/_/g, '/');
    while (sanitizedSecret.length % 4) {
        sanitizedSecret += '=';
    }

    const signatureType = funderAddress ? 1 : 0;

    return new ClobClient(
        process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com',
        parseInt(process.env.POLYMARKET_CHAIN_ID || '137'),
        wallet as any,
        {
            key: apiKey,
            secret: sanitizedSecret,
            passphrase: passphrase,
        },
        signatureType,
        funderAddress || undefined,
        undefined,
        true // useServerTime
    );
}

export async function GET(request: NextRequest) {
    try {
        const client = getClobClient();
        const walletAddress = (await (client as any).orderBuilder?.resolveSigner?.()?.getAddress?.())
            || process.env.POLYMARKET_PRIVATE_KEY?.slice(0, 10) + '...';

        // Fetch open orders
        let openOrders: any[] = [];
        try {
            openOrders = await client.getOpenOrders() || [];
        } catch (e) {
            console.error('[Polymarket API] Failed to get open orders:', e);
        }

        // Fetch trades
        let trades: any[] = [];
        try {
            trades = await client.getTrades() || [];
        } catch (e) {
            console.error('[Polymarket API] Failed to get trades:', e);
        }

        // Calculate positions from trades
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
            .map(p => ({
                ...p,
                avgPrice: p.shares !== 0 ? p.cost / p.shares : 0,
                side: p.shares > 0 ? 'LONG' : 'SHORT',
                shares: Math.abs(p.shares),
            }));

        // Fetch market slugs for open positions
        try {
            await Promise.all(openPositions.map(async (pos) => {
                if (pos.marketId) {
                    try {
                        const market = await client.getMarket(pos.marketId);
                        if (market && (market as any).market_slug) {
                            // Used 'any' cast because the type definition might not include slug depending on version
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
                    const market = await client.getMarket(marketId);
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
                    t.slug = marketSlugMap.get(mid);
                }
            });
        } catch (e) {
            console.error('Error fetching trade market slugs', e);
        }

        // Get wallet address
        let wallet = 'Unknown';
        try {
            const rawWallet = new Wallet(process.env.POLYMARKET_PRIVATE_KEY!);
            wallet = rawWallet.address;
        } catch { }

        return NextResponse.json({
            wallet,
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
                marketId: t.slug || t.market_id || t.market, // Use slug if available
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
        const { tokenId, side, amount } = await request.json();

        if (!tokenId || !side || !amount) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        console.log(`[Admin Polymarket API] Closing position: ${side} ${amount} shares of ${tokenId}`);

        const client = getClobClient();

        // To close a LONG position, we SELL. To close a SHORT position, we BUY.
        const orderSide = (side === 'LONG' || side === 'buy' || side === 'BUY') ? 'SELL' : 'BUY';

        // Fetch orderbook to get current market price and tick size
        const orderbook = await client.getOrderBook(tokenId);

        // Find the best price to execute 
        let price = orderSide === 'BUY' ? 0.99 : 0.01;

        if (orderSide === 'SELL' && orderbook.bids.length > 0) {
            // Sort bids by price descending to find the best (highest) bid
            const sortedBids = [...orderbook.bids].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
            price = parseFloat(sortedBids[0].price);
            // Slightly lower to ensure immediate fill (market-equivalent)
            price = Math.max(0.01, price - 0.01);
        } else if (orderSide === 'BUY' && orderbook.asks.length > 0) {
            // Sort asks by price ascending to find the best (lowest) ask
            const sortedAsks = [...orderbook.asks].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
            price = parseFloat(sortedAsks[0].price);
            // Slightly higher to ensure immediate fill
            price = Math.min(0.99, price + 0.01);
        }

        console.log(`[Admin Polymarket API] Using execution price: ${price} for ${orderSide}`);

        const resp = await client.createAndPostOrder({
            tokenID: tokenId,
            price: price,
            side: orderSide as any,
            size: amount,
        }, {
            tickSize: (orderbook as any).tick_size,
            negRisk: orderbook.neg_risk
        });

        console.log(`[Admin Polymarket API] Close order placed:`, resp);

        return NextResponse.json({
            success: true,
            orderId: resp?.orderID || resp?.id,
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
