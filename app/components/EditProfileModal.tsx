'use client';

import { useState } from 'react';
import { Camera, Save, User, Mail, FileText } from 'lucide-react';
import { FileTrigger } from '@/components/ui/file-trigger';
import { Button } from '@/components/ui/button';
import { sanitizeUrl } from '@/lib/utils';

import { TextField } from '@/components/ui/text-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/field';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

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

                const uploadRes = await fetch('/api/upload/avatar', {
                    method: 'POST',
                    body: formDataUpload,
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
                onSaved?.();
                onClose(); // Close dialog on success
                window.location.reload();
            }, 1000);
        } catch (error) {
            console.error('Error updating profile:', error);
            setMessage({ type: 'error', text: 'Failed to update profile.' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px] bg-[#1e1e1e] border-white/10 text-white">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        Edit Profile
                    </DialogTitle>
                    <DialogDescription className="text-gray-400">
                        Make changes to your profile here. Click save when you're done.
                    </DialogDescription>
                </DialogHeader>

                {message && (
                    <div
                        className={`p-3 rounded-md text-sm font-medium border ${message.type === 'success'
                            ? 'bg-green-500/10 border-green-500/30 text-green-400'
                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                            }`}
                    >
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6 pt-2">
                    {/* Avatar Section */}
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative group">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-3xl font-bold text-white overflow-hidden border-2 border-white/20 shadow-lg">
                                {avatarPreview ? (
                                    <img src={sanitizeUrl(avatarPreview)} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    user?.name?.charAt(0)?.toUpperCase() || '?'
                                )}
                            </div>
                            <div className="absolute -bottom-1 -right-1 bg-blue-600 rounded-full p-1.5 shadow-md">
                                <Camera className="w-4 h-4 text-white" />
                            </div>
                        </div>

                        <div className="w-full">
                            <FileTrigger
                                acceptedFileTypes={['image/*']}
                                onSelect={(files) => {
                                    if (files) {
                                        const fileArray = Array.from(files);
                                        const file = fileArray[0];
                                        if (file) {
                                            handleAvatarChange({ target: { files } } as any);
                                        }
                                    }
                                }}
                                intent="outline"
                                size="xs"
                                className="w-full !h-7 !min-h-0 !py-0 text-[10px] uppercase tracking-wider font-bold bg-white/5 border-white/20 hover:bg-white/10 hover:border-white/30 transition-all"
                            >
                                <Camera className="w-3.5 h-3.5 mr-1.5" data-slot="icon" />
                                Upload Photo
                            </FileTrigger>
                        </div>
                    </div>

                    {/* Inputs */}
                    <div className="space-y-4">
                        <TextField>
                            <Label className="text-xs uppercase text-gray-500 font-bold tracking-wider">Display Name</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Enter your name"
                                className="bg-white/5 border-white/10 focus:border-blue-500/50"
                            />
                        </TextField>

                        <TextField>
                            <Label className="text-xs uppercase text-gray-500 font-bold tracking-wider">Username</Label>
                            <Input
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                placeholder="@username"
                                className="bg-white/5 border-white/10 focus:border-blue-500/50"
                            />
                        </TextField>

                        <TextField>
                            <Label className="text-xs uppercase text-gray-500 font-bold tracking-wider">Bio</Label>
                            <Textarea
                                value={formData.bio}
                                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                placeholder="Tell us about yourself..."
                                className="bg-white/5 border-white/10 focus:border-blue-500/50 resize-none min-h-[80px]"
                            />
                        </TextField>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            intent="outline"
                            onClick={onClose}
                            className="border-white/10 hover:bg-white/5 hover:text-white"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            isDisabled={isLoading}
                            className="bg-blue-600 hover:bg-blue-500 text-white border-0"
                        >
                            {isLoading ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
