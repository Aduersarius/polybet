interface AchievementsListProps {
    achievements: string[];
}

const ACHIEVEMENT_MAP: Record<string, { label: string; icon: string; description: string }> = {
    'EARLY_ADOPTER': { label: 'Early Adopter', icon: '🚀', description: 'Joined during beta' },
    'FIRST_WIN': { label: 'First Win', icon: '🎯', description: 'Won your first bet' },
    'WHALE': { label: 'Whale', icon: '🐋', description: 'Traded over $1000 volume' },
    'PREDICTOR': { label: 'Predictor', icon: '🔮', description: '5 win streak' },
};

export function AchievementsList({ achievements }: AchievementsListProps) {
    if (!achievements || achievements.length === 0) {
        return (
            <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
                <div className="text-4xl mb-3">🌟</div>
                <h3 className="text-lg font-bold text-white mb-1">No Achievements Yet</h3>
                <p className="text-gray-400 text-sm">Place bets and win to unlock badges!</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {achievements.map((code) => {
                const achievement = ACHIEVEMENT_MAP[code] || { label: code, icon: '🏅', description: 'Unlocked achievement' };
                return (
                    <div
                        key={code}
                        className="bg-gradient-to-br from-white/5 to-white/10 border border-white/10 rounded-xl p-4 flex items-center gap-4"
                    >
                        <div className="w-12 h-12 rounded-full bg-black/30 flex items-center justify-center text-2xl">
                            {achievement.icon}
                        </div>
                        <div>
                            <div className="font-bold text-white">{achievement.label}</div>
                            <div className="text-xs text-gray-400">{achievement.description}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
