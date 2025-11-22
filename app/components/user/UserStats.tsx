interface UserStatsProps {
    stats: {
        totalBets: number;
        totalVolume: number;
        winRate: number;
    };
}

export function UserStats({ stats }: UserStatsProps) {
    const statItems = [
        { label: 'Total Bets', value: stats.totalBets.toString(), icon: '🎲' },
        { label: 'Volume', value: `$${stats.totalVolume.toFixed(2)}`, icon: '📊' },
        { label: 'Win Rate', value: `${(stats.winRate * 100).toFixed(1)}%`, icon: '🏆' },
        { label: 'Net Profit', value: '---', icon: '💰' }, // Placeholder
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {statItems.map((item, index) => (
                <div
                    key={index}
                    className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors"
                >
                    <div className="text-2xl mb-2">{item.icon}</div>
                    <div className="text-gray-400 text-sm font-medium">{item.label}</div>
                    <div className="text-xl font-bold text-white mt-1">{item.value}</div>
                </div>
            ))}
        </div>
    );
}
