'use client';

import './profile.css';
import { useSession } from '@/lib/auth-client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState, Suspense } from 'react';
import { Navbar } from '../../components/Navbar';
import { Footer } from '../../components/Footer';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Trophy, Activity, Wallet, BarChart3, Clock, Lock } from 'lucide-react';
import EditProfileModal from '@/app/components/EditProfileModal';
import PnLChart from '@/app/components/PnLChart';

interface UserStats {
    totalBets?: number;
    activeBets?: number;
    totalVolume: number;
    totalProfit: number;
    winRate?: number;
    balance?: number;
    // Fields from public API
    volume?: number;
    profit?: number;
    positions?: number;
    betCount?: number;
}

interface PublicProfile {
    username: string | null;
    avatarUrl: string | null;
    image: string | null;
    joinedAt: string;
    stats: {
        volume: number;
        profit: number;
        positions: number;
        betCount: number;
    };
}

interface BetHistory {
    id: string;
    eventId: string;
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

export const dynamic = 'force-dynamic';

function ProfileContent() {
    const { data: session, isPending: isAuthPending } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    const addressParam = searchParams.get('address');

    // Determine if we are viewing our own profile
    // If no address param is present, it's our profile (if logged in)
    // If address param matches our ID or address, it's our profile
    const user = (session as any)?.user;
    const isOwnProfile = !addressParam || (user && (addressParam === user.id || addressParam === user.address));

    // If not own profile and no address param, we can't show anything (handle redirect)

    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        image: '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    // Initial check for redirect
    useEffect(() => {
        if (!isAuthPending && !session && !addressParam) {
            router.push('/');
        } else if (user) {
            // Update form data only if it's our own profile or just to have defaults
            setFormData({
                name: user.name || '',
                image: user.image || '',
            });
        }
    }, [session, isAuthPending, router, addressParam, user]);

    // Fetch own user stats
    const { data: ownStats } = useQuery<UserStats>({
        queryKey: ['user-stats', user?.id],
        queryFn: async () => {
            const res = await fetch('/api/user/stats');
            if (!res.ok) throw new Error('Failed to fetch stats');
            return res.json();
        },
        enabled: !!user && isOwnProfile
    });

    // Fetch public profile data
    const { data: publicProfile, isLoading: isPublicLoading } = useQuery<PublicProfile>({
        queryKey: ['public-profile', addressParam],
        queryFn: async () => {
            const res = await fetch(`/api/users/${addressParam}/stats`);
            if (!res.ok) throw new Error('Failed to fetch public profile');
            return res.json();
        },
        enabled: !isOwnProfile && !!addressParam
    });

    // Fetch betting history (Only for own profile)
    const { data: bets } = useQuery<BetHistory[]>({
        queryKey: ['user-bets', user?.id],
        queryFn: async () => {
            const res = await fetch('/api/user/bets?limit=100'); // Increased limit for history
            if (!res.ok) throw new Error('Failed to fetch bets');
            return res.json();
        },
        enabled: !!user && isOwnProfile
    });

    // Fetch active positions (Only for own profile)
    const { data: positions } = useQuery<Position[]>({
        queryKey: ['user-positions', user?.id],
        queryFn: async () => {
            const res = await fetch('/api/user/positions');
            if (!res.ok) throw new Error('Failed to fetch positions');
            return res.json();
        },
        enabled: !!user && isOwnProfile
    });

    // Calculate PnL History from bets + Active Positions (Portfolio Value)
    const pnlData = user && bets ? (() => {
        // 1. Process Realized PnL from History
        const sortedBets = [...bets].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        let cumulativePnL = 0;
        const historyPoints = sortedBets.map(bet => {
            if (bet.status === 'WON' && bet.payout) {
                cumulativePnL += (bet.payout - bet.amount);
            } else if (bet.status === 'LOST') {
                cumulativePnL -= bet.amount;
            }
            return {
                date: new Date(bet.createdAt).toLocaleDateString(),
                value: cumulativePnL
            };
        });

        // 2. Add Unrealized PnL from Positions (Current State)
        // NOTE: We intentionally exclude unrealized PnL from the graph line to prevent visual "Cliffs" 
        // when a position is open but not yet closed. The graph tracks Realized Performance.
        /* 
        if (positions && positions.length > 0) {
             const totalUnrealized = positions.reduce((sum, pos: any) => {
                 return sum + (pos.unrealizedPnL || 0);
             }, 0);
             const currentTotal = cumulativePnL + totalUnrealized;
             historyPoints.push({
                 date: 'Now',
                 value: currentTotal
             });
        }
        */

        // Ensure we have a starting point
        if (historyPoints.length > 0) {
            return [{ date: 'Start', value: 0 }, ...historyPoints];
        }
        return undefined;
    })() : undefined;


    const handleSave = async () => {
        setIsSaving(true);
        try {
            const response = await fetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (!response.ok) throw new Error('Failed to update profile');

            // Refresh session/data
            router.refresh();
            setIsEditModalOpen(false);
        } catch (error) {
            console.error('Failed to save profile:', error);
        } finally {
            setIsSaving(false);
        }
    };

    // Determine data to display
    const displayUser = isOwnProfile ? user : {
        name: publicProfile?.username || 'Unknown User',
        image: publicProfile?.image || publicProfile?.avatarUrl,
        email: null, // Don't show email for public
        createdAt: publicProfile?.joinedAt,
        isAdmin: false
    };

    const displayStats: UserStats = isOwnProfile && ownStats ? ownStats : {
        totalProfit: publicProfile?.stats.profit || 0,
        totalVolume: publicProfile?.stats.volume || 0,
        // Map activePositions to 'activeBets' or handle difference
        activeBets: publicProfile?.stats.positions || 0,
        totalBets: publicProfile?.stats.betCount || 0,
        balance: undefined, // Hidden for public
        winRate: 0, // Not calculated for public yet
    };

    if (isAuthPending || (isOwnProfile && !ownStats) || (!isOwnProfile && isPublicLoading)) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">
            <Navbar />

            <main className="profile-container max-w-5xl mx-auto px-4 py-8 relative z-10" style={{ position: 'relative', zIndex: 10 }}>

                {/* Top Section: Split Layout using CSS Grid with Stretch */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-8 items-stretch">

                    {/* Card 1: User Profile Info - Compact & Styled */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="lg:col-span-4 bg-[#1e1e1e] rounded-2xl border border-white/10 p-6 flex flex-col items-center justify-center text-center relative overflow-hidden shadow-lg min-h-[260px] hover:border-pink-500/50 transition-all duration-300 group"
                    >
                        {/* Organic Background Blobs - Subtle */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none group-hover:bg-pink-500/10 transition-all duration-500"></div>
                        <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2 pointer-events-none group-hover:bg-purple-500/10 transition-all duration-500"></div>

                        <div className="relative z-10 flex flex-col items-center gap-4 w-full h-full justify-center">
                            {/* Avatar */}
                            <div className="relative group/avatar shrink-0">
                                <div className="w-32 h-32 md:w-36 md:h-36 rounded-full bg-gradient-to-tr from-pink-500 via-purple-500 to-blue-500 p-0.5 shadow-lg group-hover/avatar:shadow-2xl transition-all duration-300">
                                    <div className="w-full h-full rounded-full bg-[#1e1e1e] flex items-center justify-center overflow-hidden border-2 border-[#1e1e1e]">
                                        {displayUser?.image ? (
                                            <img src={displayUser.image} alt={displayUser.name || 'User'} className="w-full h-full object-cover transition-transform duration-500 group-hover/avatar:scale-110" />
                                        ) : (
                                            <span className="text-4xl font-bold text-gray-400">
                                                {(displayUser?.name?.charAt(0) || displayUser?.email?.charAt(0) || '?').toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {isOwnProfile && isEditing && (
                                    <div className="absolute -bottom-2 w-full">
                                        <input
                                            type="text"
                                            placeholder="URL"
                                            className="w-full text-[10px] bg-black/80 border border-white/20 rounded-full px-2 py-0.5 text-white text-center"
                                            value={formData.image}
                                            onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex flex-col items-center gap-2 w-full">
                                <div className="flex items-center gap-2 justify-center w-full">
                                    {isOwnProfile && isEditing ? (
                                        <input
                                            type="text"
                                            className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-white text-lg font-bold text-center w-full focus:outline-none focus:border-pink-500"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        />
                                    ) : (
                                        <h1 className="text-2xl font-bold text-white tracking-tight truncate max-w-[250px] group-hover:text-pink-400 transition-colors">
                                            {displayUser?.name || 'Anonymous'}
                                        </h1>
                                    )}
                                    {isOwnProfile && !isEditing && (
                                        <button
                                            onClick={() => setIsEditModalOpen(true)}
                                            className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                        >
                                            <span className="text-xs">✏️</span>
                                        </button>
                                    )}
                                </div>

                                {/* Email removed from here, moved to Account Details */}

                                <div className="mt-2">
                                    <span className="inline-block px-4 py-1.5 rounded-full bg-[#1a1b26] text-pink-400 text-xs border border-pink-500/20 font-medium tracking-wide shadow-sm group-hover:border-pink-500/40 transition-all">
                                        MEMBER SINCE {displayUser?.createdAt ? new Date(displayUser.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }).toUpperCase() : '-'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {isOwnProfile && isEditing && (
                            <div className="absolute bottom-4 left-0 w-full flex gap-2 justify-center px-4">
                                <button
                                    onClick={() => setIsEditing(false)}
                                    className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-colors border border-white/10"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="px-3 py-1 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                                >
                                    Save
                                </button>
                            </div>
                        )}
                    </motion.div>

                    {/* Card 2: PnL Graph - Matches Height */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="lg:col-span-8 h-[400px] lg:h-auto"
                    >
                        <PnLChart
                            data={pnlData}
                            className="w-full h-full bg-[#1e1e1e] rounded-2xl border border-white/10 hover:border-emerald-500/50 transition-all duration-300"
                            title="PORTFOLIO PERFORMANCE"
                        />
                    </motion.div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-[#1e1e1e] p-4 rounded-2xl border border-white/10 hover:border-blue-500/50 transition-all duration-300 group"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <Wallet className="w-5 h-5 text-blue-400" />
                            <span className="text-[10px] uppercase tracking-wider text-gray-500 group-hover:text-blue-400 transition-colors">Balance</span>
                        </div>
                        <div className="text-2xl font-bold text-white mb-1">
                            ${displayStats?.balance !== undefined ? displayStats.balance.toLocaleString() : '---'}
                        </div>
                        <div className="text-xs text-green-400 flex items-center gap-1">
                            +2.5% <span className="text-gray-600">this week</span>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-[#1e1e1e] p-4 rounded-2xl border border-white/10 hover:border-green-500/50 transition-all duration-300 group"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <TrendingUp className="w-5 h-5 text-green-400" />
                            <span className="text-[10px] uppercase tracking-wider text-gray-500 group-hover:text-green-400 transition-colors">P&L</span>
                        </div>
                        <div className={`text-2xl font-bold ${displayStats.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'} mb-1`}>
                            {displayStats.totalProfit >= 0 ? '+' : ''}${displayStats.totalProfit.toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500">All time</div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="bg-[#1e1e1e] p-4 rounded-2xl border border-white/10 hover:border-purple-500/50 transition-all duration-300 group"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <Trophy className="w-5 h-5 text-purple-400" />
                            <span className="text-[10px] uppercase tracking-wider text-gray-500 group-hover:text-purple-400 transition-colors">Win Rate</span>
                        </div>
                        <div className="text-2xl font-bold text-white mb-1">
                            {displayStats.winRate !== undefined ? `${displayStats.winRate.toFixed(1)}%` : '---'}
                        </div>
                        <div className="text-xs text-gray-500">{displayStats.totalBets || 0} total bets</div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="bg-[#1e1e1e] p-4 rounded-2xl border border-white/10 hover:border-cyan-500/50 transition-all duration-300 group"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <Activity className="w-5 h-5 text-cyan-400" />
                            <span className="text-[10px] uppercase tracking-wider text-gray-500 group-hover:text-cyan-400 transition-colors">Active</span>
                        </div>
                        <div className="text-2xl font-bold text-white mb-1">
                            {displayStats.activeBets !== undefined ? displayStats.activeBets : '---'}
                        </div>
                        <div className="text-xs text-gray-500">Open positions</div>
                    </motion.div>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Positions & Betting History */}
                    <div className="lg:col-span-2 space-y-8">
                        {isOwnProfile ? (
                            <>
                                {/* Active Positions */}
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                    className="bg-[#1e1e1e] rounded-xl border border-white/10 overflow-hidden hover:border-blue-500/50 transition-all duration-300 group"
                                    style={{ backgroundColor: '#1e1e1e' }}
                                >
                                    <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#1a1b26]/50">
                                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                            <BarChart3 className="w-5 h-5 text-blue-400" />
                                            Active Positions
                                        </h2>
                                        <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-medium">
                                            {positions?.length || 0} open
                                        </span>
                                    </div>
                                    <div className="divide-y divide-white/10">
                                        {positions && positions.length > 0 ? (
                                            positions.map((pos, idx) => (
                                                <Link
                                                    href={`/event/${pos.eventId}`}
                                                    key={idx}
                                                    className="block p-4 hover:bg-white/5 transition-colors group cursor-pointer"
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="space-y-1">
                                                            <h3 className="font-medium text-white text-sm leading-tight group-hover:text-blue-400 transition-colors">{pos.eventTitle}</h3>
                                                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${pos.option === 'YES' ? 'bg-green-500/20 text-green-400' :
                                                                pos.option === 'NO' ? 'bg-red-500/20 text-red-400' : 'bg-purple-500/20 text-purple-400'
                                                                }`}>
                                                                {pos.option}
                                                            </span>
                                                        </div>
                                                        <div className={`text-right ${pos.unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                            <div className="font-bold text-sm">{pos.unrealizedPnL >= 0 ? '+' : ''}${Math.round(pos.unrealizedPnL).toLocaleString()}</div>
                                                            <div className="text-[10px] text-gray-500 uppercase tracking-wider">P&L</div>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2 text-xs opacity-60 group-hover:opacity-100 transition-opacity">
                                                        <div>
                                                            <div className="text-gray-500">Shares</div>
                                                            <div className="text-white font-mono">{pos.shares.toFixed(2)}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-gray-500">Avg</div>
                                                            <div className="text-white font-mono">${pos.avgPrice.toFixed(2)}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-gray-500">Cur</div>
                                                            <div className="text-white font-mono">${pos.currentPrice.toFixed(2)}</div>
                                                        </div>
                                                    </div>
                                                </Link>
                                            ))
                                        ) : (
                                            <div className="p-8 text-center text-gray-500">
                                                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                                <p className="text-sm">No active positions</p>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>

                                {/* Betting History */}
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                    className="bg-[#1e1e1e] rounded-xl border border-white/10 overflow-hidden hover:border-purple-500/50 transition-all duration-300 group"
                                    style={{ backgroundColor: '#1e1e1e' }}
                                >
                                    <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#1a1b26]/50">
                                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                            <Clock className="w-5 h-5 text-purple-400" />
                                            Recent Bets
                                        </h2>
                                        <Link href="/profile/history" className="text-xs text-blue-400 hover:text-blue-300 font-medium hover:underline">
                                            View All
                                        </Link>
                                    </div>
                                    <div className="divide-y divide-white/10">
                                        {bets && bets.length > 0 ? (
                                            bets.map((bet) => (
                                                <Link
                                                    href={`/event/${bet.eventId}`}
                                                    key={bet.id}
                                                    className="block p-4 hover:bg-white/5 transition-colors cursor-pointer"
                                                >
                                                    <div className="flex justify-between items-start mb-1">
                                                        <div className="flex-1 min-w-0 pr-4">
                                                            <h3 className="font-medium text-white text-sm truncate hover:text-purple-400 transition-colors">{bet.eventTitle}</h3>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${bet.option === 'YES' ? 'bg-green-500/10 text-green-400' :
                                                                    bet.option === 'NO' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'
                                                                    }`}>
                                                                    {bet.option}
                                                                </span>
                                                                <span className="text-gray-600 text-[10px]">
                                                                    {new Date(bet.createdAt).toLocaleDateString()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <div className="font-bold text-white text-sm">${bet.amount.toFixed(2)}</div>
                                                            {bet.status !== 'PENDING' && (
                                                                <div className={`text-xs ${bet.payout! > bet.amount ? 'text-green-400' : 'text-red-400'}`}>
                                                                    {bet.payout! > bet.amount ? '+' : ''}${(bet.payout! - bet.amount).toFixed(2)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </Link>
                                            ))
                                        ) : (
                                            <div className="p-8 text-center text-gray-500">
                                                <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                                <p className="text-sm">No betting history</p>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            </>
                        ) : (
                            <div className="bg-[#1e1e1e] rounded-xl border border-white/10 p-12 text-center text-gray-500 hover:border-gray-500/50 transition-all duration-300">
                                <Lock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                <h3 className="text-lg font-bold text-white mb-2">Private Portfolio</h3>
                                <p>Positions and betting history are hidden for other users.</p>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Account Details & Achievements */}
                    <div className="space-y-6">
                        {/* Account Details */}
                        {isOwnProfile && (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.2 }}
                                className="bg-[#1e1e1e] rounded-xl border border-white/10 p-6 hover:border-orange-500/50 transition-all duration-300 group"
                                style={{ backgroundColor: '#1e1e1e' }}
                            >
                                <h2 className="text-lg font-bold text-white mb-4">Account Details</h2>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs text-gray-500 uppercase mb-1">Username</label>
                                        <div className="text-white font-medium">{displayUser?.name || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 uppercase mb-1">Email</label>
                                        <div className="text-white font-medium">{displayUser?.email || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 uppercase mb-1">User ID</label>
                                        <div className="text-gray-400 text-xs font-mono truncate">{user?.id || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 uppercase mb-1">Member Since</label>
                                        <div className="text-white font-medium">
                                            {displayUser?.createdAt ? new Date(displayUser.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'N/A'}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Achievements */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                            className="bg-[#1e1e1e] rounded-xl border border-white/10 p-6 hover:border-yellow-500/50 transition-all duration-300 group"
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

export default function ProfilePage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white">Loading...</div>}>
            <ProfileContent />
        </Suspense>
    );
}
