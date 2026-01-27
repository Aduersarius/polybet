'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authClient } from '@/lib/auth-client';

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

interface EditProfileModalProps {
    user: User;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function EditProfileModal({ user, isOpen, onClose, onSuccess }: EditProfileModalProps) {
    const [username, setUsername] = useState(user.username || '');
    const [description, setDescription] = useState(user.description || '');
    const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');

    const [twitter, setTwitter] = useState(user.twitter || '');
    const [discord, setDiscord] = useState(user.discord || '');
    const [telegram, setTelegram] = useState(user.telegram || '');
    const [website, setWebsite] = useState(user.website || '');

    const [isLoading, setIsLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) throw new Error('Upload failed');

            const data = await res.json();
            setAvatarUrl(data.url);
        } catch (error) {
            console.error('Upload error:', error);
            alert('Failed to upload image');
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            console.log('Submitting profile update:', { username, description, avatarUrl, twitter, discord, telegram, website });
            const res = await fetch(`/api/users/${user.address}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    description,
                    avatarUrl,
                    twitter,
                    discord,
                    telegram,
                    website
                }),
            });

            if (!res.ok) {
                const errorData = await res.json();
                console.error('Update failed:', errorData);
                throw new Error(errorData.error || 'Failed to update profile');
            }

            const data = await res.json();
            console.log('Update success:', data);

            // Refresh session to update client-side state
            try {
                await authClient.getSession();
                console.log('Session refreshed successfully');
            } catch (sessionError) {
                console.warn('Failed to refresh session:', sessionError);
            }

            onSuccess();
        } catch (error) {
            console.error('Submit error:', error);
            alert('Failed to update profile: ' + (error as Error).message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-0 flex items-center justify-center z-[70] p-4"
                    >
                        <div className="w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                            <h2 className="text-xl font-bold text-white mb-6">Edit Profile</h2>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Basic Info</h3>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-1">Avatar</label>
                                            <div className="flex items-center gap-4">
                                                <div className="w-16 h-16 rounded-full bg-white/10 overflow-hidden border border-white/20">
                                                    {avatarUrl ? (
                                                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-2xl">👤</div>
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleFileUpload}
                                                        className="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
                                                    />
                                                    {uploading && <p className="text-xs text-blue-400 mt-1">Uploading...</p>}
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-1">Username</label>
                                            <input
                                                type="text"
                                                value={username}
                                                onChange={(e) => setUsername(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                                                placeholder="Enter username"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-1">Bio</label>
                                            <textarea
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors h-24 resize-none"
                                                placeholder="Tell us about yourself"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Social Links</h3>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-1">Twitter (X)</label>
                                            <input
                                                type="text"
                                                value={twitter}
                                                onChange={(e) => setTwitter(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                                                placeholder="@username"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-1">Discord</label>
                                            <input
                                                type="text"
                                                value={discord}
                                                onChange={(e) => setDiscord(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                                                placeholder="username#0000"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-1">Telegram</label>
                                            <input
                                                type="text"
                                                value={telegram}
                                                onChange={(e) => setTelegram(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                                                placeholder="@username"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-1">Website</label>
                                            <input
                                                type="url"
                                                value={website}
                                                onChange={(e) => setWebsite(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                                                placeholder="https://..."
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-8 pt-4 border-t border-white/10">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="flex-1 px-4 py-2 rounded-lg font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isLoading || uploading}
                                        className="flex-1 px-4 py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
                                    >
                                        {isLoading ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
