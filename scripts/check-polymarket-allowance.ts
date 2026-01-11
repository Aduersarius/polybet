/**
 * Check on-chain balance and allowance
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e on Polygon
const EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'; // Polymarket Exchange

const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function approve(address spender, uint256 amount) returns (bool)',
];

async function main() {
    const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com');
    const wallet = new ethers.Wallet(process.env.POLYMARKET_PRIVATE_KEY!, provider);

    console.log('=== On-Chain Balance & Allowance Check ===\n');
    console.log('Wallet:', wallet.address);
    console.log('USDC.e Contract:', USDC_E_ADDRESS);
    console.log('Exchange Contract:', EXCHANGE_ADDRESS);
    console.log('');

    const usdc = new ethers.Contract(USDC_E_ADDRESS, ERC20_ABI, wallet);

    const decimals = await usdc.decimals();
    const balance = await usdc.balanceOf(wallet.address);
    const allowance = await usdc.allowance(wallet.address, EXCHANGE_ADDRESS);

    const balanceFormatted = ethers.formatUnits(balance, decimals);
    const allowanceFormatted = ethers.formatUnits(allowance, decimals);

    console.log('USDC.e Balance:', balanceFormatted, 'USDC.e');
    console.log('Allowance for Exchange:', allowanceFormatted, 'USDC.e');
    console.log('');

    if (allowance < balance) {
        console.log('⚠️  Allowance is LESS than balance!');
        console.log('   You need to approve the exchange contract to spend your USDC.e');
        console.log('');
        console.log('Would you like to approve? Run this script with --approve flag');
    } else {
        console.log('✓ Allowance is sufficient');
    }

    // Check if --approve flag is passed
    if (process.argv.includes('--approve')) {
        console.log('\n=== Approving Exchange Contract ===');
        const maxApproval = ethers.MaxUint256;
        console.log('Approving max amount...');

        try {
            const tx = await usdc.approve(EXCHANGE_ADDRESS, maxApproval);
            console.log('Transaction sent:', tx.hash);
            console.log('Waiting for confirmation...');
            await tx.wait();
            console.log('✓ Approval confirmed!');
        } catch (e: any) {
            console.log('Error:', e.message);
        }
    }
}

main().catch(console.error);
