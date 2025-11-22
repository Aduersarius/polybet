
import { prisma } from './lib/prisma';

async function main() {
    console.log('Seeding rules for events...');

    const events = await prisma.event.findMany();

    for (const event of events) {
        let rules = '';

        if (event.categories.includes('CRYPTO')) {
            rules = `This market resolves to "Yes" if the price of the asset is strictly above the target price at the resolution time. The resolution source will be CoinGecko or Binance API.`;
        } else if (event.categories.includes('SPORTS')) {
            rules = `This market resolves based on the official match result at the end of regulation time. Overtime and penalties are excluded unless specified otherwise.`;
        } else if (event.categories.includes('POLITICS')) {
            rules = `This market resolves based on the official announcement from the relevant government body or reputable news sources (AP, Reuters, BBC).`;
        } else {
            rules = `This market resolves according to the specific conditions described in the title. In case of ambiguity, the market creator's clarification will be final.`;
        }

        await prisma.event.update({
            where: { id: event.id },
            data: { rules },
        });
        console.log(`Updated rules for event: ${event.title}`);
    }

    console.log('All events updated with rules!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
