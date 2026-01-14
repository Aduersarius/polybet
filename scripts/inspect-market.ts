
import { polymarketTrading } from '../lib/polymarket-trading';

async function inspectMarket() {
    const marketId = '997488';

    try {
        console.log(`--- Inspecting Market: ${marketId} ---`);

        // Try to get market details if available via clobClient directly
        // The clobClient has a getMarket method
        const client = (polymarketTrading as any).clobClient;
        if (client) {
            try {
                const market = await client.getMarket(marketId);
                console.log('Market Details:', JSON.stringify(market, null, 2));
            } catch (e) {
                console.log('getMarket failed:', e.message);
            }
        }

        // Check tokens from mapping
        const yesId = '5161623255678193352839985156330393796378434470119114669671615782853260939535';
        const noId = '57216272564529548464686463691236811991956032201293786790337952253964682584376';

        console.log(`\n--- Orderbook for YES (${yesId.slice(-8)}) ---`);
        const yesOb = await client.getOrderBook(yesId);
        console.log('YES Bids:', yesOb.bids?.slice(0, 3));
        console.log('YES Asks:', yesOb.asks?.slice(0, 3));

        console.log(`\n--- Orderbook for NO (${noId.slice(-8)}) ---`);
        const noOb = await client.getOrderBook(noId);
        console.log('NO Bids:', noOb.bids?.slice(0, 3));
        console.log('NO Asks:', noOb.asks?.slice(0, 3));

    } catch (err) {
        console.error('Inspection failed:', err);
    }
}

inspectMarket();
