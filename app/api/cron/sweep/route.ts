import { NextRequest, NextResponse } from 'next/server';
import { processDepositSweep } from '@/workflows/sweep';

export async function GET(req: NextRequest) {
    // Basic Auth or Vercel Cron header check could be added here
    // const authHeader = req.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //     return new Response('Unauthorized', { status: 401 });
    // }

    try {
        const check = await processDepositSweep() as any;
        return NextResponse.json({ success: true, instanceId: check.instanceId });
    } catch (error: any) {
        console.error('Sweep Cron Failed:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
