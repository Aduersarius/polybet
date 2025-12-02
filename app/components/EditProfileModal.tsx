'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Save, X, User, Mail, FileText } from 'lucide-react';
import { FileTrigger } from '@/components/ui/file-trigger';
import { Button as IntentButton } from '@/components/ui/button';

import { TextField } from '@/components/ui/text-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/field';

interface EditProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
    onSaved?: () => void;
}

export default function EditProfileModal({ isOpen, onClose, user, onSaved }: EditProfileModalProps) {
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
                const formDataUpload = new FormData();
                formDataUpload.append('file', avatarFile);

                console.log('Uploading file:', avatarFile.name, avatarFile.type, avatarFile.size);

                const uploadRes = await fetch('/api/upload/avatar', {
                    method: 'POST',
                    body: formDataUpload,
                });

                console.log('Upload response status:', uploadRes.status, uploadRes.statusText);

                if (!uploadRes.ok) {
                    const responseText = await uploadRes.text();
                    console.error('Upload failed - Status:', uploadRes.status);
                    console.error('Upload failed - Response text:', responseText);

                    try {
                        const errorData = JSON.parse(responseText);
                        throw new Error(errorData.details || errorData.error || 'Failed to upload avatar');
                    } catch (e) {
                        throw new Error(`Upload failed (${uploadRes.status}): ${responseText.substring(0, 200)}`);
                    }
                }

                const { url } = await uploadRes.json();
                console.log('Upload successful:', url);
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
                onSaved?.();
                window.location.reload();
            }, 1500);
        } catch (error) {
            console.error('Error updating profile:', error);
            setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
                    />

                    {/* Modal */}
                    <div className="fixed inset-0 flex items-center justify-center z-50 p-4 overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#1e1e1e] rounded-2xl border border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                            style={{ backgroundColor: '#1e1e1e' }}
                        >
                            {/* Header */}
                            <div className="sticky top-0 bg-[#1e1e1e] border-b border-white/10 p-6 flex items-center justify-between z-10" style={{ backgroundColor: '#1e1e1e' }}>
                                <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                                    Edit Profile
                                </h2>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>

                            {/* Message */}
                            {message && (
                                <div className="mx-6 mt-4">
                                    <div
                                        className={`p-4 rounded-lg border ${message.type === 'success'
                                            ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                                            }`}
                                    >
                                        {message.text}
                                    </div>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="p-6 space-y-6">
                                {/* Avatar Section */}
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                        <Camera className="w-5 h-5 text-blue-400" />
                                        Profile Picture
                                    </h3>

                                    <div className="flex flex-col items-center gap-6">
                                        {/* Avatar Preview */}
                                        <div className="relative group">
                                            <div className="w-32 h-32 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-4xl font-bold text-white overflow-hidden border-4 border-white/20 shadow-xl">
                                                {avatarPreview ? (
                                                    <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                                                ) : (
                                                    user?.name?.charAt(0)?.toUpperCase() || '?'
                                                )}
                                            </div>
                                            <div className="absolute -bottom-2 -right-2 bg-blue-600 rounded-full p-2 shadow-lg">
                                                <Camera className="w-5 h-5 text-white" />
                                            </div>
                                        </div>

                                        {/* Upload Info & FileTrigger */}
                                        <div className="w-full text-center">
                                            <p className="text-gray-400 text-sm mb-4">
                                                Click below to upload a new photo. JPG, PNG or GIF. Max size 5MB.
                                            </p>

                                            <FileTrigger
                                                acceptedFileTypes={['image/*']}
                                                defaultCamera="user"
                                                onSelect={(files) => {
                                                    if (files) {
                                                        const fileArray = Array.from(files);
                                                        const file = fileArray[0];
                                                        if (file) {
                                                            handleAvatarChange({ target: { files } } as any);
                                                        }
                                                    }
                                                }}
                                                intent="primary"
                                                size="md"
                                                className="w-full"
                                            >
                                                <Camera className="w-4 h-4" data-slot="icon" />
                                                Upload New Photo
                                            </FileTrigger>
                                        </div>
                                    </div>
                                </div>

                                {/* Personal Information */}
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                        <User className="w-5 h-5 text-purple-400" />
                                        Personal Information
                                    </h3>

                                    <div className="space-y-4">
                                        {/* Name */}
                                        <TextField>
                                            <Label>Display Name</Label>
                                            <Input
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                placeholder="Enter your name"
                                            />
                                        </TextField>

                                        {/* Username */}
                                        <TextField>
                                            <Label>Username</Label>
                                            <Input
                                                value={formData.username}
                                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                                placeholder="@username"
                                            />
                                        </TextField>

                                        {/* Email */}
                                        <TextField>
                                            <Label className="flex items-center gap-2">
                                                <Mail className="w-4 h-4" />
                                                Email Address
                                            </Label>
                                            <Input
                                                type="email"
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                placeholder="your@email.com"
                                            />
                                        </TextField>

                                        {/* Bio */}
                                        <TextField>
                                            <Label className="flex items-center gap-2">
                                                <FileText className="w-4 h-4" />
                                                Bio
                                            </Label>
                                            <Textarea
                                                value={formData.bio}
                                                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                                rows={3}
                                                placeholder="Tell us about yourself..."
                                                className="resize-none"
                                            />
                                        </TextField>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-3 pt-4">
                                    <IntentButton
                                        type="submit"
                                        isDisabled={isLoading}
                                        intent="primary"
                                        size="lg"
                                        className="flex-1"
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
                                    </IntentButton>

                                    <IntentButton
                                        type="button"
                                        onPress={onClose}
                                        intent="secondary"
                                        size="lg"
                                    >
                                        Cancel
                                    </IntentButton>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
