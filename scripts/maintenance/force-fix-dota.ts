import { prisma } from '../../lib/prisma';

async function forceFix() {
  console.log('🔧 Force fixing Dota 2 event date...\n');

  try {
    // Delete ALL Dota 2 Falcons vs Xtreme events
    const deleted = await prisma.event.deleteMany({
      where: {
        OR: [
          {
            AND: [
              { title: { contains: 'Falcons', mode: 'insensitive' } },
              { title: { contains: 'Xtreme', mode: 'insensitive' } },
            ]
          },
          {
            polymarketId: '107656' // The specific event ID from logs
          }
        ]
      }
    });

    console.log(`✅ Deleted ${deleted.count} stale event(s)`);

    // Now fetch fresh from Polymarket and create with correct date
    const response = await fetch('https://gamma-api.polymarket.com/events?tag_slug=dota-2&closed=false&active=true&limit=50');
    const events = await response.json();

    const falconsEvent = events.find((e: any) =>
      e.title?.toLowerCase().includes('falcons') &&
      e.title?.toLowerCase().includes('xtreme')
    );

    if (falconsEvent) {
      console.log('\n📥 Found event on Polymarket:', {
        id: falconsEvent.id,
        slug: falconsEvent.slug,
        title: falconsEvent.title,
        startDate: falconsEvent.startDate,
      });

      // Extract date from slug
      const slugDateMatch = falconsEvent.slug.match(/(\d{4}-\d{2}-\d{2})/);
      const correctDate = slugDateMatch ? slugDateMatch[1] : falconsEvent.startDate;

      console.log(`\n✨ Correct date from slug: ${correctDate}`);

      // Parse odds
      let yesOdds = 0.5, noOdds = 0.5;
      if (falconsEvent.markets?.[0]?.outcomePrices) {
        const prices = JSON.parse(falconsEvent.markets[0].outcomePrices);
        yesOdds = parseFloat(prices[0]);
        noOdds = parseFloat(prices[1]);
      }

      // Get system user
      const systemUser = await prisma.user.findFirst({ where: { email: 'system@pariflow.com' } });
      if (!systemUser) {
        console.error('❌ System user not found');
        return;
      }

      // Create new event with correct date
      const newEvent = await prisma.event.create({
        data: {
          title: falconsEvent.title,
          description: falconsEvent.description || '',
          category: 'Esports',
          categories: ['Esports', 'Dota 2'],
          status: 'ACTIVE',
          type: 'BINARY',
          source: 'POLYMARKET',
          polymarketId: falconsEvent.id,
          startTime: new Date(correctDate + 'T00:00:00Z'),
          resolutionDate: falconsEvent.endDate ? new Date(falconsEvent.endDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdById: systemUser.id,
          yesOdds,
          noOdds,
          externalVolume: parseFloat(falconsEvent.volume || 0),
          externalBetCount: 0,
          live: false, // Not live yet, it's Dec 19
          eventType: 'upcoming',
          isEsports: true,
          sport: 'Dota 2',
          league: 'Professional',
          teamA: 'Team Falcons',
          teamB: 'Xtreme Gaming',
        }
      });

      console.log('\n✅ Created new event:', {
        id: newEvent.id,
        title: newEvent.title,
        startTime: newEvent.startTime,
        live: newEvent.live,
        eventType: newEvent.eventType,
      });

      console.log('\n🎉 Done! The event now shows the correct date (Dec 19)');
    } else {
      console.log('❌ Event not found on Polymarket');
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

forceFix();

