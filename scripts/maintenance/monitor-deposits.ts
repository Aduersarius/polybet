import 'dotenv/config';
import { getCryptoService } from '../../lib/crypto-service';

async function main() {
    console.log('🚀 Starting Deposit Monitor...');
    console.log('Press Ctrl+C to stop');

    while (true) {
        try {
        const service = getCryptoService();
        await service.checkDeposits();
        } catch (error) {
            console.error('Error in monitor loop:', error);
        }

        // Wait 10 seconds before next check
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

main().catch(console.error);
