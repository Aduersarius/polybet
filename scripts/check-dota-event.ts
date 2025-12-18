import { prisma } from '../lib/prisma';

async function checkDotaEvent() {
  const events = await prisma.event.findMany({
    where: {
      title: {
        contains: 'Falcons',
        mode: 'insensitive',
      },
      AND: {
        title: {
          contains: 'Xtreme',
          mode: 'insensitive',
        },
      },
    },
    select: {
      id: true,
      title: true,
      startTime: true,
      live: true,
      gameStatus: true,
      eventType: true,
      polymarketId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  console.log('=== Dota 2 Falcons vs Xtreme Events in Database ===');
  console.log(JSON.stringify(events, null, 2));
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/742aed11-5b39-48e6-8157-d3822a5f786a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'check-dota-event.ts:32',message:'Database query result',data:{count:events.length,events},timestamp:Date.now(),sessionId:'debug-session',runId:'db-check',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion

  await prisma.$disconnect();
}

checkDotaEvent().catch(console.error);

