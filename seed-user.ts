
import { prisma } from './lib/prisma';

async function main() {
    console.log('Updating all users...');

    const updateResult = await prisma.user.updateMany({
        data: {
            username: 'CryptoKing',
            avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
            description: 'Early crypto adopter and prediction market enthusiast.',
        },
    });

    console.log(`Updated ${updateResult.count} users successfully!`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
