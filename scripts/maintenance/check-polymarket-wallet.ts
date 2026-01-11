
import 'dotenv/config';
import { Wallet, ethers } from 'ethers';

// Required Addresses on Polygon
const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const POLYMARKET_EXCHANGE = ethers.getAddress("0x4b799988b48bfa65c92c813be6a7b77464d673c5");

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
];

const CTF_ABI = [
    "function isApprovedForAll(address account, address operator) view returns (bool)",
    "function balanceOf(address account, uint256 id) view returns (uint256)"
];

async function checkWallet() {
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
    const providerUrl = process.env.POLYGON_PROVIDER_URL || "https://polygon-rpc.com";

    if (!privateKey) {
        console.error("❌ POLYMARKET_PRIVATE_KEY not found in .env");
        return;
    }

    const provider = new ethers.JsonRpcProvider(providerUrl);
    const wallet = new Wallet(privateKey, provider);
    const address = wallet.address;

    console.log(`\n🔍 Checking Polymarket Wallet: ${address}`);

    try {
        const maticBalance = await provider.getBalance(address);
        console.log(`🪙 MATIC Balance: ${ethers.formatEther(maticBalance)} MATIC`);

        const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
        const usdcBalance = await usdc.balanceOf(address);
        const usdcDecimals = await usdc.decimals();
        console.log(`💵 USDC Balance: ${ethers.formatUnits(usdcBalance, usdcDecimals)} USDC`);

        const usdcAllowance = await usdc.allowance(address, POLYMARKET_EXCHANGE);
        console.log(`✅ USDC Allowance for Exchange: ${ethers.formatUnits(usdcAllowance, usdcDecimals)} USDC`);

        const ctf = new ethers.Contract(CTF_ADDRESS, CTF_ABI, provider);
        const isCTFApproved = await ctf.isApprovedForAll(address, POLYMARKET_EXCHANGE);
        console.log(`📦 CTF (Shares) Approved for Exchange: ${isCTFApproved ? "YES ✓" : "NO ✗"}`);

    } catch (error: any) {
        console.error("❌ Error checking wallet:", error.message);
    }
}

checkWallet();
