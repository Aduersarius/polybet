import { prisma } from './lib/prisma';

async function verify() {
    const count = await prisma.event.count();
    const firstEvent = await prisma.event.findFirst({
        select: { title: true, createdAt: true }
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 DATABASE VERIFICATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔗 Connected to:', process.env.DATABASE_URL?.split('@')[1]?.split('/')[0]);
    console.log('📈 Total Events:', count);
    console.log('✅ Expected (VPS seed):', 18);
    console.log('🎯 Match?', count === 18 ? '✅ YES - Using VPS Postgres!' : '⚠️  Database mismatch');
    console.log('');
    console.log('First event:', firstEvent?.title);
    console.log('Created:', firstEvent?.createdAt);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await prisma.$disconnect();
}

verify();
