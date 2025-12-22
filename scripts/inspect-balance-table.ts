import 'dotenv/config';
import { prisma } from '@/lib/prisma';

async function main() {
    const cols = await prisma.$queryRaw<Array<{ column_name: string; data_type: string }>>`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'Balance'
        ORDER BY ordinal_position
    `;
    console.log(cols);
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});



