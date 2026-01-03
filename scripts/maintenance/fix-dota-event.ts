import { prisma } from '../../lib/prisma';

async function fixDotaEvent() {
  console.log('=== Fixing Dota 2 Falcons vs Xtreme Event ===\n');
  
  // Find the event
  const event = await prisma.event.findFirst({
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
  });

  if (!event) {
    console.log('❌ Event not found');
    await prisma.$disconnect();
    return;
  }

  console.log('Found event:', {
    id: event.id,
    title: event.title,
    startTime: event.startTime,
    live: event.live,
    polymarketId: event.polymarketId,
  });

  // Option 1: Delete it (will be recreated on next sync with correct date)
  const deleted = await prisma.event.delete({
    where: { id: event.id },
  });

  console.log('\n✅ Event deleted successfully');
  console.log('Next sync will recreate it with the correct date from the slug.');

  await prisma.$disconnect();
}

fixDotaEvent().catch(console.error);

