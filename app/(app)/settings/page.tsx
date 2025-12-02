'use client';

import './settings.css';
import { useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/app/components/Navbar';
import { Footer } from '@/app/components/Footer';
import { motion } from 'framer-motion';
import { Camera, Save, X, Upload, User, Mail, FileText, Shield } from 'lucide-react';

export default function SettingsPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const user = session?.user as any;

    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.image || null);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);

    const [formData, setFormData] = useState({
        name: user?.name || '',
        email: user?.email || '',
        username: user?.username || '',
        bio: user?.bio || '',
    });

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                setMessage({ type: 'error', text: 'Please select an image file' });
                return;
            }

            // Validate file size (5MB max)
            if (file.size > 5 * 1024 * 1024) {
                setMessage({ type: 'error', text: 'Image size must be less than 5MB' });
                return;
            }

            setAvatarFile(file);

            // Create preview
            const reader = new FileReader();
            reader.onload = (e) => {
                setAvatarPreview(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage(null);

        try {
            let avatarUrl = user?.image;

            // Upload avatar if changed
            if (avatarFile) {
                const formData = new FormData();
                formData.append('file', avatarFile);

                const uploadRes = await fetch('/api/upload/avatar', {
                    method: 'POST',
                    body: formData,
                });

                if (!uploadRes.ok) {
                    throw new Error('Failed to upload avatar');
                }

                const { url } = await uploadRes.json();
                avatarUrl = url;
            }

            // Update profile
            const updateRes = await fetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    image: avatarUrl,
                }),
            });

            if (!updateRes.ok) {
                throw new Error('Failed to update profile');
            }

            setMessage({ type: 'success', text: 'Profile updated successfully!' });
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } catch (error) {
            console.error('Error updating profile:', error);
            setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
        } finally {
            setIsLoading(false);
        }
    };

    if (!session) {
        router.push('/');
        return null;
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white">
            <Navbar />

            <main className="settings-container max-w-4xl mx-auto px-4 py-8">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
                        Profile Settings
                    </h1>
                    <p className="text-gray-400">Manage your account settings and preferences</p>
                </motion.div>

                {/* Message */}
                {message && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`mb-6 p-4 rounded-lg border ${message.type === 'success'
                            ? 'bg-green-500/10 border-green-500/30 text-green-400'
                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                            }`}
                    >
                        {message.text}
                    </motion.div>
                )}

                <form onSubmit={handleSubmit}>
                    {/* Avatar Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-[#1e1e1e] rounded-xl p-8 border border-white/10 mb-6"
                        style={{ backgroundColor: '#1e1e1e' }}
                    >
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <Camera className="w-5 h-5 text-blue-400" />
                            Profile Picture
                        </h2>

                        <div className="flex flex-col md:flex-row items-center gap-6">
                            {/* Avatar Preview */}
                            <div className="relative group">
                                <div className="w-32 h-32 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-4xl font-bold text-white overflow-hidden border-4 border-white/20 shadow-2xl">
                                    {avatarPreview ? (
                                        <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        user?.name?.charAt(0)?.toUpperCase() || '?'
                                    )}
                                </div>
                                <label
                                    htmlFor="avatar-upload"
                                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                                >
                                    <Upload className="w-8 h-8 text-white" />
                                </label>
                                <input
                                    id="avatar-upload"
                                    type="file"
                                    accept="image/*"
                                    onChange={handleAvatarChange}
                                    className="hidden"
                                />
                            </div>

                            {/* Upload Info */}
                            <div className="flex-1 text-center md:text-left">
                                <h3 className="text-white font-medium mb-2">Change your avatar</h3>
                                <p className="text-gray-400 text-sm mb-4">
                                    Click on the image to upload a new photo. JPG, PNG or GIF. Max size 5MB.
                                </p>
                                <label
                                    htmlFor="avatar-upload"
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium cursor-pointer transition-colors"
                                >
                                    <Upload className="w-4 h-4" />
                                    Upload New Photo
                                </label>
                            </div>
                        </div>
                    </motion.div>

                    {/* Personal Information */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-[#1e1e1e] rounded-xl p-8 border border-white/10 mb-6"
                        style={{ backgroundColor: '#1e1e1e' }}
                    >
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <User className="w-5 h-5 text-purple-400" />
                            Personal Information
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Display Name
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                                    placeholder="Enter your name"
                                />
                            </div>

                            {/* Username */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Username
                                </label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                                    placeholder="@username"
                                />
                            </div>

                            {/* Email */}
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                                    <Mail className="w-4 h-4" />
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                                    placeholder="your@email.com"
                                />
                            </div>

                            {/* Bio */}
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                                    <FileText className="w-4 h-4" />
                                    Bio
                                </label>
                                <textarea
                                    value={formData.bio}
                                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                    rows={4}
                                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors resize-none"
                                    placeholder="Tell us about yourself..."
                                />
                            </div>
                        </div>
                    </motion.div>

                    {/* Account Details */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="bg-[#1e1e1e] rounded-xl p-8 border border-white/10 mb-6"
                        style={{ backgroundColor: '#1e1e1e' }}
                    >
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <Shield className="w-5 h-5 text-green-400" />
                            Account Details
                        </h2>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center py-3 border-b border-white/10">
                                <div>
                                    <div className="text-white font-medium">Account ID</div>
                                    <div className="text-sm text-gray-400 font-mono">{user?.id}</div>
                                </div>
                            </div>

                            <div className="flex justify-between items-center py-3 border-b border-white/10">
                                <div>
                                    <div className="text-white font-medium">Member Since</div>
                                    <div className="text-sm text-gray-400">
                                        {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                        }) : 'N/A'}
                                    </div>
                                </div>
                            </div>

                            {user?.isAdmin && (
                                <div className="flex justify-between items-center py-3">
                                    <div>
                                        <div className="text-white font-medium">Account Type</div>
                                        <div className="text-sm text-purple-400">Administrator</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>

                    {/* Action Buttons */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="flex gap-4"
                    >
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="w-5 h-5" />
                                    Save Changes
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="px-6 py-3 rounded-lg bg-white/5 hover:bg-white/10 text-white font-medium transition-colors flex items-center gap-2"
                        >
                            <X className="w-5 h-5" />
                            Cancel
                        </button>
                    </motion.div>
                </form>
            </main>

            <Footer />
        </div>
    );
}
