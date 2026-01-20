
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAlchemySignature, AlchemyWebhookPayload } from '@/lib/alchemy-webhook';
import { ethers } from 'ethers';
import { Prisma } from '@prisma/client';
import { redis } from '@/lib/redis';

export const runtime = 'nodejs';

// Support both USDC tokens on Polygon
const USDC_NATIVE_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'.toLowerCase(); // Native USDC
const USDC_BRIDGED_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'.toLowerCase(); // USDC.e (bridged)

export async function POST(req: NextRequest) {
    // Webhooks disabled in favor of worker polling
    return NextResponse.json({
        success: true,
        message: 'Webhooks disabled. Polling mode active.'
    });
}


