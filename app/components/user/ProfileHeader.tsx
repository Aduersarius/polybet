'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { EditProfileModal } from './EditProfileModal';

interface User {
    address: string;
    username?: string;
    description?: string;
    avatarUrl?: string;
    twitter?: string;
    discord?: string;
    telegram?: string;
    website?: string;
}

interface ProfileHeaderProps {
    user: User;
    isOwner: boolean;
    onUpdate: () => void;
}

/**
 * Validates URL has safe protocol (http/https only)
 * Defense-in-depth: prevents javascript: XSS even if backend validation is bypassed
 */
function getSafeUrl(url: string | undefined): string | null {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol) ? url : null;
    } catch {
        return null;
    }
}

/**
 * Validates social handle contains only safe characters
 */
function getSafeHandle(handle: string | undefined): string | null {
    if (!handle) return null;
    const cleaned = handle.replace(/^@/, '').trim();
    // Only allow alphanumeric, underscores, and periods
    if (!/^[a-zA-Z0-9_.]{1,50}$/.test(cleaned)) return null;
    return cleaned;
}

export function ProfileHeader({ user, isOwner, onUpdate }: ProfileHeaderProps) {
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    // Memoize validated URLs and handles for security
    const safeWebsite = useMemo(() => getSafeUrl(user.website), [user.website]);
    const safeAvatarUrl = useMemo(() => getSafeUrl(user.avatarUrl), [user.avatarUrl]);
    const safeTwitter = useMemo(() => getSafeHandle(user.twitter), [user.twitter]);
    const safeTelegram = useMemo(() => getSafeHandle(user.telegram), [user.telegram]);

    return (
        <div className="relative mb-8">
            {/* Banner/Background - could be customizable later */}
            <div className="h-48 w-full bg-gradient-to-r from-blue-900/40 to-purple-900/40 rounded-xl border border-white/10 overflow-hidden">
                <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
            </div>

            <div className="px-8 pb-4 relative z-10">
                <div className="flex flex-col md:flex-row items-end -mt-16 gap-6">
                    {/* Avatar */}
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="relative"
                    >
                        <div className="w-32 h-32 rounded-xl bg-black border-4 border-black overflow-hidden shadow-2xl">
                            {safeAvatarUrl ? (
                                <img
                                    src={safeAvatarUrl}
                                    alt={user.username || 'User'}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-4xl font-bold text-white">
                                    {(user.username?.[0] || user.address.slice(2, 3)).toUpperCase()}
                                </div>
                            )}
                        </div>
                    </motion.div>

                    {/* Info */}
                    <div className="flex-1 mb-2">
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold text-white">
                                {user.username || 'Anonymous User'}
                            </h1>
                            {isOwner && (
                                <button
                                    onClick={() => {
                                        console.log('Edit Profile clicked');
                                        setIsEditModalOpen(true);
                                    }}
                                    className="px-3 py-1 text-xs font-medium bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors border border-white/10 cursor-pointer"
                                >
                                    Edit Profile
                                </button>
                            )}
                        </div>
                        <p className="text-gray-400 font-mono text-sm mt-1">
                            {user.address.slice(0, 6)}...{user.address.slice(-4)}
                        </p>
                        {user.description && (
                            <p className="text-gray-300 mt-3 max-w-2xl leading-relaxed">
                                {user.description}
                            </p>
                        )}

                        {/* Social Links - with validated handles */}
                        <div className="flex gap-4 mt-4">
                            {safeTwitter && (
                                <a href={`https://twitter.com/${safeTwitter}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-400 transition-colors">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                                </a>
                            )}
                            {user.discord && (
                                <div className="text-gray-400 hover:text-indigo-400 transition-colors cursor-help" title={`Discord: ${user.discord}`}>
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 13.4 13.4 0 0 0-.59 1.203 18.38 18.38 0 0 0-7.13 0 13.413 13.413 0 0 0-.593-1.203.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.086 2.157 2.419 0 1.334-.956 2.42-2.157 2.42zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.086 2.157 2.419 0 1.334-.946 2.42-2.157 2.42z" /></svg>
                                </div>
                            )}
                            {safeTelegram && (
                                <a href={`https://t.me/${safeTelegram}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-400 transition-colors">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 11.944 0zm4.961 7.224c.138.338-1.858 6.992-2.582 9.288-.175.554-.39.381-.755.141-1.25-.82-2.606-1.65-3.679-2.365-.515-.342.12-1.304.763-1.993.579-.621 2.68-2.7 2.623-2.813-.059-.118-.406-.006-.618.136-.533.355-3.638 2.375-3.903 2.55-.406.268-1.12.196-1.611.044-.539-.168-1.325-.44-1.818-.635-.656-.26-.485-.965.144-1.224 3.275-1.407 5.472-2.362 6.59-2.839 3.145-1.342 3.674-1.59 4.074-1.59.235 0 .436.062.518.163.07.085.076.21.054.334z" /></svg>
                                </a>
                            )}
                            {safeWebsite && (
                                <a href={safeWebsite} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-green-400 transition-colors">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {isEditModalOpen && (
                <EditProfileModal
                    user={user}
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    onSuccess={() => {
                        setIsEditModalOpen(false);
                        onUpdate();
                    }}
                />
            )}
        </div>
    );
}
