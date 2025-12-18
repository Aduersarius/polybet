import 'dotenv/config';
import { getCryptoService } from '../lib/crypto-service';

async function main() {
    const service = getCryptoService();
    await service.checkDeposits();
    console.log('checkDeposits done');
}

main().catch((err) => {
    console.error('checkDeposits failed:', err);
    process.exit(1);
});


