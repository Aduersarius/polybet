'use client';

import './profile.css';
import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Navbar } from '../../components/Navbar';
import { Footer } from '../../components/Footer';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Trophy, Activity, Wallet, BarChart3, Clock } from 'lucide-react';
import EditProfileModal from '@/app/components/EditProfileModal';

interface UserStats {
    totalBets: number;
    activeBets: number;
    totalVolume: number;
    totalProfit: number;
    winRate: number;
    balance: number;
}

interface BetHistory {
    id: string;
    eventTitle: string;
    amount: number;
    option: string;
    createdAt: string;
    status: string;
    payout?: number;
}

interface Position {
    eventId: string;
    eventTitle: string;
    option: string;
    shares: number;
    avgPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
}

export default function ProfilePage() {
    const { data: session, isPending } = useSession();
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        image: '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    // Fetch user stats
    const { data: stats } = useQuery<UserStats>({
        queryKey: ['user-stats', (session as any)?.user?.id],
        queryFn: async () => {
            const res = await fetch('/api/user/stats');
            if (!res.ok) throw new Error('Failed to fetch stats');
            return res.json();
        },
        enabled: !!(session as any)?.user
    });

    // Fetch betting history
    const { data: bets } = useQuery<BetHistory[]>({
        queryKey: ['user-bets', (session as any)?.user?.id],
        queryFn: async () => {
            const res = await fetch('/api/user/bets?limit=10');
            if (!res.ok) throw new Error('Failed to fetch bets');
            return res.json();
        },
        enabled: !!(session as any)?.user
    });

    // Fetch active positions
    const { data: positions } = useQuery<Position[]>({
        queryKey: ['user-positions', (session as any)?.user?.id],
        queryFn: async () => {
            const res = await fetch('/api/user/positions');
            if (!res.ok) throw new Error('Failed to fetch positions');
            return res.json();
        },
        enabled: !!(session as any)?.user
    });

    useEffect(() => {
        if (!isPending && !session) {
            router.push('/');
        } else if (session?.user) {
            setFormData({
                name: (session.user as any).name || '',
                image: (session.user as any).image || '',
            });
        }
    }, [session, isPending, router]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const response = await fetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (!response.ok) throw new Error('Failed to update profile');
            window.location.reload();
        } catch (error) {
            console.error('Error updating profile:', error);
            alert('Failed to save changes');
        } finally {
            setIsSaving(false);
            setIsEditing(false);
        }
    };

    if (isPending || !session) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
                <div className="animate-pulse text-blue-400">Loading profile...</div>
            </div>
        );
    }

    const user = session?.user as any;

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white">
            <Navbar />

            <main className="profile-container max-w-7xl mx-auto px-4 py-8 relative z-10" style={{ position: 'relative', zIndex: 10 }}>
                {/* Hero Section with User Info */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative overflow-hidden bg-[#1e1e1e] rounded-2xl p-8 border border-white/10 mb-8"
                    style={{ backgroundColor: '#1e1e1e' }}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10"></div>
                    <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5"></div>
                    <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                        {/* Avatar */}
                        <div className="relative group">
                            <div className="w-32 h-32 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-4xl font-bold text-white overflow-hidden border-4 border-white/20 shadow-2xl">
                                {formData.image ? (
                                    <img src={formData.image} alt={formData.name} className="w-full h-full object-cover" />
                                ) : (
                                    (user?.name?.charAt(0) || user?.email?.charAt(0) || '?').toUpperCase()
                                )}
                            </div>
                            {isEditing && (
                                <div className="absolute -bottom-2 w-full">
                                    <input
                                        type="text"
                                        placeholder="Image URL"
                                        className="w-full text-xs bg-black/80 border border-white/20 rounded px-2 py-1 text-white"
                                        value={formData.image}
                                        onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                                    />
                                </div>
                            )}
                        </div>

                        {/* User Info */}
                        <div className="flex-1 text-center md:text-left">
                            {isEditing ? (
                                <input
                                    type="text"
                                    className="w-full max-w-md bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white text-2xl font-bold mb-2 focus:outline-none focus:border-blue-500"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            ) : (
                                <h1 className="text-4xl font-bold text-white mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                                    {user?.name || 'Anonymous Trader'}
                                </h1>
                            )}

                            <p className="text-gray-300 mb-4 flex items-center gap-2 justify-center md:justify-start">
                                <span>{user?.email || 'No email'}</span>
                            </p>

                            <div className="flex flex-wrap justify-center md:justify-start gap-3">
                                <span className="px-4 py-1.5 rounded-full bg-blue-500/20 text-blue-300 text-sm border border-blue-500/30 backdrop-blur-sm">
                                    🗓️ Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}
                                </span>
                                {user?.isAdmin && (
                                    <span className="px-4 py-1.5 rounded-full bg-purple-500/20 text-purple-300 text-sm border border-purple-500/30 backdrop-blur-sm">
                                        👑 Administrator
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Edit Button */}
                        <button
                            onClick={() => setIsEditModalOpen(true)}
                            className="px-6 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-all backdrop-blur-sm border border-white/20"
                        >
                            ✏️ Edit Profile
                        </button>
                    </div>
                </motion.div>

                {/* Stats Grid */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
                >
                    <div className="bg-[#1e1e1e] rounded-xl p-6 border border-white/10 hover:border-blue-500/50 transition-all group" style={{ backgroundColor: '#1e1e1e' }}>
                        <div className="flex items-center justify-between mb-2">
                            <Wallet className="w-5 h-5 text-blue-400" />
                            <span className="text-xs text-gray-500">BALANCE</span>
                        </div>
                        <div className="text-2xl font-bold text-white">${stats?.balance.toLocaleString() || '0'}</div>
                        <div className="text-xs text-green-400 mt-1">+2.5% this week</div>
                    </div>

                    <div className="bg-[#1e1e1e] rounded-xl p-6 border border-white/10 hover:border-green-500/50 transition-all" style={{ backgroundColor: '#1e1e1e' }}>
                        <div className="flex items-center justify-between mb-2">
                            <TrendingUp className="w-5 h-5 text-green-400" />
                            <span className="text-xs text-gray-500">P&L</span>
                        </div>
                        <div className={`text-2xl font-bold ${(stats?.totalProfit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {(stats?.totalProfit || 0) >= 0 ? '+' : ''} ${stats?.totalProfit.toFixed(2) || '0.00'}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">All time</div>
                    </div>

                    <div className="bg-[#1e1e1e] rounded-xl p-6 border border-white/10 hover:border-purple-500/50 transition-all" style={{ backgroundColor: '#1e1e1e' }}>
                        <div className="flex items-center justify-between mb-2">
                            <Trophy className="w-5 h-5 text-purple-400" />
                            <span className="text-xs text-gray-500">WIN RATE</span>
                        </div>
                        <div className="text-2xl font-bold text-white">{stats?.winRate.toFixed(1) || '0.0'}%</div>
                        <div className="text-xs text-gray-400 mt-1">{stats?.totalBets || 0} total bets</div>
                    </div>

                    <div className="bg-[#1e1e1e] rounded-xl p-6 border border-white/10 hover:border-cyan-500/50 transition-all" style={{ backgroundColor: '#1e1e1e' }}>
                        <div className="flex items-center justify-between mb-2">
                            <Activity className="w-5 h-5 text-cyan-400" />
                            <span className="text-xs text-gray-500">ACTIVE</span>
                        </div>
                        <div className="text-2xl font-bold text-white">{stats?.activeBets || 0}</div>
                        <div className="text-xs text-gray-400 mt-1">Open positions</div>
                    </div>
                </motion.div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Positions & Betting History */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Active Positions */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="bg-[#1e1e1e] rounded-xl border border-white/10 overflow-hidden"
                            style={{ backgroundColor: '#1e1e1e' }}
                        >
                            <div className="p-6 border-b border-white/10 flex justify-between items-center">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <BarChart3 className="w-5 h-5 text-blue-400" />
                                    Active Positions
                                </h2>
                                <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-sm">
                                    {positions?.length || 0} open
                                </span>
                            </div>
                            <div className="divide-y divide-white/10">
                                {positions && positions.length > 0 ? (
                                    positions.map((pos, idx) => (
                                        <div key={idx} className="p-6 hover:bg-white/5 transition-colors">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h3 className="font-medium text-white mb-1">{pos.eventTitle}</h3>
                                                    <span className="px-2 py-1 rounded-full bg-purple-500/20 text-purple-400 text-xs">
                                                        {pos.option}
                                                    </span>
                                                </div>
                                                <div className={`text-right ${pos.unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    <div className="font-bold">{pos.unrealizedPnL >= 0 ? '+' : ''}${pos.unrealizedPnL.toFixed(2)}</div>
                                                    <div className="text-xs text-gray-500">P&L</div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-4 text-sm">
                                                <div>
                                                    <div className="text-gray-500">Shares</div>
                                                    <div className="text-white font-medium">{pos.shares}</div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500">Avg Price</div>
                                                    <div className="text-white font-medium">${pos.avgPrice.toFixed(2)}</div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500">Current</div>
                                                    <div className="text-white font-medium">${pos.currentPrice.toFixed(2)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-12 text-center text-gray-500">
                                        <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                        <p>No active positions</p>
                                        <p className="text-sm mt-1">Start trading to see your portfolio here!</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>

                        {/* Betting History */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="bg-[#1e1e1e] rounded-xl border border-white/10 overflow-hidden"
                            style={{ backgroundColor: '#1e1e1e' }}
                        >
                            <div className="p-6 border-b border-white/10 flex justify-between items-center">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-purple-400" />
                                    Recent Bets
                                </h2>
                                <button className="text-sm text-blue-400 hover:text-blue-300">View All →</button>
                            </div>
                            <div className="divide-y divide-white/10">
                                {bets && bets.length > 0 ? (
                                    bets.map((bet) => (
                                        <div key={bet.id} className="p-6 hover:bg-white/5 transition-colors">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex-1">
                                                    <h3 className="font-medium text-white mb-1">{bet.eventTitle}</h3>
                                                    <div className="flex items-center gap-2">
                                                        <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs">
                                                            {bet.option}
                                                        </span>
                                                        <span className="text-gray-500 text-sm">
                                                            {new Date(bet.createdAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-bold text-white">${bet.amount.toFixed(2)}</div>
                                                    {bet.payout && (
                                                        <div className={`text-sm ${bet.payout > bet.amount ? 'text-green-400' : 'text-red-400'}`}>
                                                            {bet.payout > bet.amount ? '+' : ''}${(bet.payout - bet.amount).toFixed(2)}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded-full text-xs ${bet.status === 'WON' ? 'bg-green-500/20 text-green-400' :
                                                    bet.status === 'LOST' ? 'bg-red-500/20 text-red-400' :
                                                        'bg-yellow-500/20 text-yellow-400'
                                                    }`}>
                                                    {bet.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-12 text-center text-gray-500">
                                        <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                        <p>No betting history yet</p>
                                        <p className="text-sm mt-1">Your bets will appear here!</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>

                    {/* Right Column: Account Details & Achievements */}
                    <div className="space-y-6">
                        {/* Account Details */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 }}
                            className="bg-[#1e1e1e] rounded-xl border border-white/10 p-6"
                            style={{ backgroundColor: '#1e1e1e' }}
                        >
                            <h2 className="text-lg font-bold text-white mb-4">Account Details</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs text-gray-500 uppercase mb-1">Username</label>
                                    <div className="text-white font-medium">{user?.name || 'N/A'}</div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 uppercase mb-1">Email</label>
                                    <div className="text-white font-medium">{user?.email || 'N/A'}</div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 uppercase mb-1">User ID</label>
                                    <div className="text-gray-400 text-xs font-mono truncate">{user?.id || 'N/A'}</div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 uppercase mb-1">Member Since</label>
                                    <div className="text-white font-medium">
                                        {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'N/A'}
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        {/* Achievements */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                            className="bg-[#1e1e1e] rounded-xl border border-white/10 p-6"
                            style={{ backgroundColor: '#1e1e1e' }}
                        >
                            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <Trophy className="w-5 h-5 text-yellow-400" />
                                Achievements
                            </h2>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white/5 rounded-lg p-3 text-center border border-white/10">
                                    <div className="text-2xl mb-1">🎯</div>
                                    <div className="text-xs text-gray-400">First Bet</div>
                                </div>
                                <div className="bg-white/5 rounded-lg p-3 text-center border border-white/10 opacity-50">
                                    <div className="text-2xl mb-1">🔥</div>
                                    <div className="text-xs text-gray-400">10 Win Streak</div>
                                </div>
                                <div className="bg-white/5 rounded-lg p-3 text-center border border-white/10 opacity-50">
                                    <div className="text-2xl mb-1">💎</div>
                                    <div className="text-xs text-gray-400">$1k Volume</div>
                                </div>
                                <div className="bg-white/5 rounded-lg p-3 text-center border border-white/10 opacity-50">
                                    <div className="text-2xl mb-1">👑</div>
                                    <div className="text-xs text-gray-400">Top Trader</div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </main>

            <EditProfileModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                user={user}
                onSaved={() => setIsEditModalOpen(false)}
            />

            <Footer />
        </div>
    );
}
