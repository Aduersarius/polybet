import 'dotenv/config';
import { ethers } from 'ethers';

const MASTER_MNEMONIC = process.env.CRYPTO_MASTER_MNEMONIC;
const PROVIDER_URL = process.env.POLYGON_PROVIDER_URL || 'https://polygon-rpc.com';

async function main() {
    if (!MASTER_MNEMONIC) {
        console.error('❌ CRYPTO_MASTER_MNEMONIC is not set in .env');
        return;
    }

    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);

    // Master Wallet is at index 0
    const masterNode = ethers.HDNodeWallet.fromPhrase(MASTER_MNEMONIC, undefined, "m");
    const masterWallet = masterNode.derivePath(`m/44'/60'/0'/0/0`).connect(provider);

    console.log('\n🔑 Master Wallet Details');
    console.log('-----------------------');
    console.log(`Address: ${masterWallet.address}`);

    try {
        const maticBalance = await provider.getBalance(masterWallet.address);
        console.log(`MATIC Balance: ${ethers.formatEther(maticBalance)} MATIC`);

        // Check USDC Balance if contract address is known
        const usdcAddress = process.env.USDC_CONTRACT_ADDRESS || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
        const usdcContract = new ethers.Contract(usdcAddress, ["function balanceOf(address) view returns (uint256)"], provider);
        const usdcBalance = await usdcContract.balanceOf(masterWallet.address);
        console.log(`USDC Balance: ${ethers.formatUnits(usdcBalance, 6)} USDC`);
    } catch (e) {
        console.log('Could not fetch balances (check PROVIDER_URL)');
    }

    console.log('\n👉 This is the address you must fund with:');
    console.log('   1. MATIC (for gas fees)');
    console.log('   2. USDC (for withdrawals)');
}

main().catch(console.error);
