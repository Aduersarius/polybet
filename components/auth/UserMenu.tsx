'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, LogOut, Settings, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/use-session';
import { signOut } from '@/lib/auth-client';

export function UserMenu() {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const { user, isLoading } = useUser();

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleSignOut = async () => {
        await signOut();
    };

    if (isLoading) {
        return (
            <div className="w-24 h-8 bg-gray-200 rounded-md animate-pulse"></div>
        );
    }

    if (!user) {
        return (
            <Button
                variant="secondary"
                onClick={() => router.push('/auth/login')}
            >
                Sign In
            </Button>
        );
    }

    return (
        <div className="relative" ref={menuRef}>
            <button
                type="button"
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-full"
                onClick={() => setIsOpen(!isOpen)}
            >
                {user.image ? (
                    <img
                        src={user.image}
                        alt={user.name || 'User'}
                        className="w-8 h-8 rounded-full"
                    />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        <User className="w-4 h-4" />
                    </div>
                )}
                <span className="hidden sm:inline">{user.name || 'Account'}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                    <div className="py-1" role="none">
                        <div className="px-4 py-2 border-b">
                            <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                        </div>

                        <button
                            className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            onClick={() => {
                                router.push('/profile');
                                setIsOpen(false);
                            }}
                        >
                            <User className="mr-3 h-4 w-4 text-gray-400" />
                            Your Profile
                        </button>

                        <button
                            className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            onClick={() => {
                                router.push('/settings');
                                setIsOpen(false);
                            }}
                        >
                            <Settings className="mr-3 h-4 w-4 text-gray-400" />
                            Settings
                        </button>

                        <div className="border-t border-gray-100 my-1"></div>

                        <button
                            className="flex w-full items-center px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                            onClick={handleSignOut}
                        >
                            <LogOut className="mr-3 h-4 w-4 text-red-400" />
                            Sign out
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
