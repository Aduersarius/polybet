
import { ClobClient } from '@polymarket/clob-client';

async function main() {
    const client = new ClobClient('https://clob.polymarket.com', 137, undefined as any, undefined as any);

    const conditionId = '0xb1d2cd56624ec8bb3d8115d50d503d0e8578bf32d754ad5fe3c0e08a73186c57';
    console.log(`Fetching market for condition ID: ${conditionId}`);

    try {
        const market = await client.getMarket(conditionId);
        console.log('Market response:', JSON.stringify(market, null, 2));
    } catch (error: any) {
        console.error('Error fetching market:', error.message);
    }
}

main();
