'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut, twoFactor, email, authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/app/components/Navbar';
import { Footer } from '@/app/components/Footer';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Bell,
    Eye,
    Shield,
    DollarSign,
    LogOut,
    User,
    Check,
    Loader2,
    Mail,
    Smartphone,
    Link2,
    Trash2,
    AlertTriangle,
    Copy,
    RefreshCw,
    CheckCircle2,
    XCircle
} from 'lucide-react';
import EditProfileModal from '@/app/components/EditProfileModal';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { UserSettings } from '@/lib/settings-context';
import { toast } from '@/components/ui/use-toast';
import { QRCodeSVG } from 'qrcode.react';

const defaultSettings: UserSettings = {
    trading: {
        confirmOrders: true,
        quickBetAmounts: [5, 10, 25, 50, 100],
        autoRefreshOdds: true,
        refreshInterval: 5,
    },
    notifications: {
        priceAlerts: true,
        positionUpdates: true,
        eventResolution: true,
        emailNotifications: false,
    },
    display: {
        currency: 'USD',
        timezone: 'auto',
        oddsFormat: 'probability',
    },
    privacy: {
        publicProfile: true,
        showActivity: true,
    },
};

// Sidebar categories
const categories = [
    { id: 'trading', label: 'Trading', icon: DollarSign, color: 'text-green-400' },
    { id: 'notifications', label: 'Notifications', icon: Bell, color: 'text-yellow-400' },
    { id: 'display', label: 'Display', icon: Eye, color: 'text-purple-400' },
    { id: 'privacy', label: 'Privacy', icon: Shield, color: 'text-cyan-400' },
    { id: 'account', label: 'Account', icon: User, color: 'text-orange-400' },
];

// Toggle Switch Component
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            onClick={() => !disabled && onChange(!checked)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-white/10'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
            <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'
                    }`}
            />
        </button>
    );
}

// Setting Row Component
function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between py-4 border-b border-white/5 last:border-0">
            <div className="flex-1 mr-4">
                <div className="text-white font-medium">{label}</div>
                {description && <div className="text-sm text-gray-500 mt-0.5">{description}</div>}
            </div>
            <div className="flex-shrink-0">
                {children}
            </div>
        </div>
    );
}

export default function SettingsPage() {
    const { data: session, isPending } = useSession();
    const router = useRouter();
    const user = (session as any)?.user;

    const [settings, setSettings] = useState<UserSettings>(defaultSettings);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState('trading');

    // Account settings state
    const [showChangeEmailModal, setShowChangeEmailModal] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [show2FAPasswordPrompt, setShow2FAPasswordPrompt] = useState(false);
    const [twoFAPassword, setTwoFAPassword] = useState('');
    const [show2FASetup, setShow2FASetup] = useState(false);
    const [totpUri, setTotpUri] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [is2FAEnabled, setIs2FAEnabled] = useState(false);
    const [showDisable2FAPrompt, setShowDisable2FAPrompt] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [resendCooldown, setResendCooldown] = useState(0);

    // Resend cooldown timer
    useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [resendCooldown]);

    // Check 2FA status on mount
    useEffect(() => {
        const check2FAStatus = async () => {
            try {
                // Check if user has 2FA enabled by checking if TwoFactor record exists
                const res = await fetch('/api/user/2fa-status');
                if (res.ok) {
                    const data = await res.json();
                    setIs2FAEnabled(data.enabled);
                }
            } catch (err) {
                console.error('Failed to check 2FA status:', err);
            }
        };
        if (user) {
            check2FAStatus();
        }
    }, [user]);

    // Fetch settings on mount
    useEffect(() => {
        if (user) {
            fetch('/api/user/settings')
                .then(res => res.json())
                .then(data => {
                    // Deep merge with defaults to ensure all properties exist
                    setSettings({
                        trading: { ...defaultSettings.trading, ...data?.trading },
                        notifications: { ...defaultSettings.notifications, ...data?.notifications },
                        display: { ...defaultSettings.display, ...data?.display },
                        privacy: { ...defaultSettings.privacy, ...data?.privacy },
                    });
                    setIsLoading(false);
                })
                .catch(() => {
                    setIsLoading(false);
                });
        }
    }, [user]);

    // Redirect if not logged in
    useEffect(() => {
        if (!isPending && !session) {
            router.push('/');
        }
    }, [session, isPending, router]);

    const handleSave = async () => {
        setIsSaving(true);
        setSaveStatus('idle');

        try {
            const res = await fetch('/api/user/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });

            if (!res.ok) throw new Error('Failed to save');

            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } catch {
            setSaveStatus('error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSignOut = async () => {
        await signOut();
        router.push('/');
    };

    const updateSetting = <T extends keyof UserSettings>(
        category: T,
        key: keyof UserSettings[T],
        value: any
    ) => {
        setSettings(prev => ({
            ...prev,
            [category]: {
                ...prev[category],
                [key]: value,
            },
        }));
    };

    if (isPending || isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (!session) {
        return null;
    }

    const renderContent = () => {
        switch (activeCategory) {
            case 'trading':
                return (
                    <div className="space-y-2">
                        <SettingRow label="Confirm Orders" description="Show confirmation dialog before placing bets">
                            <Toggle
                                checked={settings.trading.confirmOrders}
                                onChange={(v) => updateSetting('trading', 'confirmOrders', v)}
                            />
                        </SettingRow>

                        <SettingRow label="Auto-Refresh Odds" description="Automatically update odds in real-time">
                            <Toggle
                                checked={settings.trading.autoRefreshOdds}
                                onChange={(v) => updateSetting('trading', 'autoRefreshOdds', v)}
                            />
                        </SettingRow>

                        {settings.trading.autoRefreshOdds && (
                            <SettingRow label="Refresh Interval" description="How often to refresh odds">
                                <Select
                                    value={settings.trading.refreshInterval.toString()}
                                    onValueChange={(v) => updateSetting('trading', 'refreshInterval', parseInt(v))}
                                >
                                    <SelectTrigger className="w-[140px] bg-[#1a1b26] border-white/10 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1a1b26] border-white/10">
                                        <SelectItem value="1" className="text-white hover:bg-white/10 focus:bg-white/10">1 second</SelectItem>
                                        <SelectItem value="5" className="text-white hover:bg-white/10 focus:bg-white/10">5 seconds</SelectItem>
                                        <SelectItem value="10" className="text-white hover:bg-white/10 focus:bg-white/10">10 seconds</SelectItem>
                                        <SelectItem value="30" className="text-white hover:bg-white/10 focus:bg-white/10">30 seconds</SelectItem>
                                    </SelectContent>
                                </Select>
                            </SettingRow>
                        )}
                    </div>
                );

            case 'notifications':
                return (
                    <div className="space-y-2">
                        <SettingRow label="Price Alerts" description="Get notified when odds change significantly">
                            <Toggle
                                checked={settings.notifications.priceAlerts}
                                onChange={(v) => updateSetting('notifications', 'priceAlerts', v)}
                            />
                        </SettingRow>

                        <SettingRow label="Position Updates" description="Updates about your active positions">
                            <Toggle
                                checked={settings.notifications.positionUpdates}
                                onChange={(v) => updateSetting('notifications', 'positionUpdates', v)}
                            />
                        </SettingRow>

                        <SettingRow label="Event Resolution" description="Get notified when events are resolved">
                            <Toggle
                                checked={settings.notifications.eventResolution}
                                onChange={(v) => updateSetting('notifications', 'eventResolution', v)}
                            />
                        </SettingRow>

                        <SettingRow label="Email Notifications" description="Receive updates via email">
                            <Toggle
                                checked={settings.notifications.emailNotifications}
                                onChange={(v) => updateSetting('notifications', 'emailNotifications', v)}
                            />
                        </SettingRow>
                    </div>
                );

            case 'display':
                return (
                    <div className="space-y-2">
                        <SettingRow label="Currency" description="Display currency for amounts">
                            <Select
                                value={settings.display.currency}
                                onValueChange={(v) => updateSetting('display', 'currency', v)}
                            >
                                <SelectTrigger className="w-[140px] bg-[#1a1b26] border-white/10 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1a1b26] border-white/10">
                                    <SelectItem value="USD" className="text-white hover:bg-white/10 focus:bg-white/10">USD ($)</SelectItem>
                                    <SelectItem value="RUB" className="text-white hover:bg-white/10 focus:bg-white/10">RUB (₽)</SelectItem>
                                    <SelectItem value="EUR" className="text-white hover:bg-white/10 focus:bg-white/10">EUR (€)</SelectItem>
                                </SelectContent>
                            </Select>
                        </SettingRow>

                        <SettingRow label="Odds Format" description="How probabilities are displayed">
                            <Select
                                value={settings.display.oddsFormat}
                                onValueChange={(v) => updateSetting('display', 'oddsFormat', v)}
                            >
                                <SelectTrigger className="w-[160px] bg-[#1a1b26] border-white/10 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1a1b26] border-white/10">
                                    <SelectItem value="probability" className="text-white hover:bg-white/10 focus:bg-white/10">Probability (%)</SelectItem>
                                    <SelectItem value="decimal" className="text-white hover:bg-white/10 focus:bg-white/10">Decimal (2.50)</SelectItem>
                                    <SelectItem value="fractional" className="text-white hover:bg-white/10 focus:bg-white/10">Fractional (3/2)</SelectItem>
                                </SelectContent>
                            </Select>
                        </SettingRow>

                        <SettingRow label="Timezone" description="For event times and schedules">
                            <Select
                                value={settings.display.timezone}
                                onValueChange={(v) => updateSetting('display', 'timezone', v)}
                            >
                                <SelectTrigger className="w-[180px] bg-[#1a1b26] border-white/10 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1a1b26] border-white/10">
                                    <SelectItem value="auto" className="text-white hover:bg-white/10 focus:bg-white/10">Auto-detect</SelectItem>
                                    <SelectItem value="UTC" className="text-white hover:bg-white/10 focus:bg-white/10">UTC</SelectItem>
                                    <SelectItem value="Europe/Moscow" className="text-white hover:bg-white/10 focus:bg-white/10">Moscow (MSK)</SelectItem>
                                    <SelectItem value="America/New_York" className="text-white hover:bg-white/10 focus:bg-white/10">New York (EST)</SelectItem>
                                    <SelectItem value="Europe/London" className="text-white hover:bg-white/10 focus:bg-white/10">London (GMT)</SelectItem>
                                </SelectContent>
                            </Select>
                        </SettingRow>
                    </div>
                );

            case 'privacy':
                return (
                    <div className="space-y-2">
                        <SettingRow label="Public Profile" description="Allow others to view your profile">
                            <Toggle
                                checked={settings.privacy.publicProfile}
                                onChange={(v) => updateSetting('privacy', 'publicProfile', v)}
                            />
                        </SettingRow>

                        <SettingRow label="Show Betting Activity" description="Display your bets on your public profile">
                            <Toggle
                                checked={settings.privacy.showActivity}
                                onChange={(v) => updateSetting('privacy', 'showActivity', v)}
                                disabled={!settings.privacy.publicProfile}
                            />
                        </SettingRow>
                    </div>
                );

            case 'account':
                return (
                    <div className="space-y-6">
                        {/* Email Section */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Email</h3>
                            <div className="bg-white/5 rounded-lg p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Mail className="w-5 h-5 text-gray-400" />
                                        <div>
                                            <div className="text-white font-medium">{user?.email || 'No email'}</div>
                                            <div className="flex items-center gap-2 text-sm mt-1">
                                                {user?.emailVerified ? (
                                                    <span className="flex items-center gap-1 text-green-400">
                                                        <CheckCircle2 className="w-4 h-4" />
                                                        Verified
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-yellow-400">
                                                        <XCircle className="w-4 h-4" />
                                                        Not verified
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        {!user?.emailVerified && (
                                            <button
                                                onClick={async () => {
                                                    if (resendCooldown > 0) return;
                                                    try {
                                                        const res = await fetch('/api/user/send-verification', {
                                                            method: 'POST',
                                                            credentials: 'include',
                                                        });
                                                        const data = await res.json();
                                                        if (res.ok) {
                                                            toast({ title: 'Verification email sent!', variant: 'success' });
                                                            setResendCooldown(60);
                                                        } else {
                                                            toast({ title: data.error || 'Failed to send email', variant: 'destructive' });
                                                        }
                                                    } catch {
                                                        toast({ title: 'Failed to send email', variant: 'destructive' });
                                                    }
                                                }}
                                                disabled={resendCooldown > 0}
                                                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${resendCooldown > 0 ? 'bg-gray-600/20 text-gray-500 cursor-not-allowed' : 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30'}`}
                                            >
                                                {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend'}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setShowChangeEmailModal(true)}
                                            className="px-3 py-1.5 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                                        >
                                            Change
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Integrations Section */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Integrations</h3>
                            <div className="bg-white/5 rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                                            <svg className="w-6 h-6" viewBox="0 0 24 24">
                                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="text-white font-medium">Google</div>
                                            <div className="text-sm text-gray-400">Sign in with Google</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            try {
                                                await (authClient as any).signIn?.social({ provider: 'google' });
                                            } catch {
                                                toast({ title: 'Google is not configured', variant: 'destructive' });
                                            }
                                        }}
                                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
                                    >
                                        Connect
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Two-Factor Authentication Section */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Two-Factor Authentication</h3>
                            <div className="bg-white/5 rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Smartphone className="w-5 h-5 text-gray-400" />
                                        <div>
                                            <div className="text-white font-medium flex items-center gap-2">
                                                Authenticator App
                                                {is2FAEnabled && (
                                                    <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">Enabled</span>
                                                )}
                                            </div>
                                            <div className="text-sm text-gray-400">
                                                {is2FAEnabled ? 'Your account is protected with 2FA' : 'Use an app like Google Authenticator'}
                                            </div>
                                        </div>
                                    </div>
                                    {is2FAEnabled ? (
                                        <button
                                            onClick={() => setShowDisable2FAPrompt(true)}
                                            className="px-4 py-2 text-sm border border-red-500/50 text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                                        >
                                            Disable 2FA
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setShow2FAPasswordPrompt(true)}
                                            className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors"
                                        >
                                            Set up 2FA
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Danger Zone */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider">Danger Zone</h3>
                            <div className="bg-red-600/10 border border-red-500/30 rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Trash2 className="w-5 h-5 text-red-400" />
                                        <div>
                                            <div className="text-white font-medium">Delete Account</div>
                                            <div className="text-sm text-gray-400">Permanently delete your account and all data</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowDeleteConfirm(true)}
                                        className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    const activeCategoryData = categories.find(c => c.id === activeCategory);

    return (
        <div className="min-h-screen text-white relative z-10 flex flex-col">
            <Navbar />

            <main className="max-w-5xl mx-auto px-4 py-8 w-full flex-1">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
                        Settings
                    </h1>
                    <p className="text-gray-400">Manage your trading preferences and account settings</p>
                </motion.div>

                {/* Main Layout with Sidebar */}
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Sidebar */}
                    <motion.aside
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="lg:w-64 flex-shrink-0"
                    >
                        <div className="bg-[#1e1e1e] rounded-xl border border-white/10 p-2 sticky top-24">
                            <nav className="space-y-1">
                                {categories.map((category) => {
                                    const Icon = category.icon;
                                    const isActive = activeCategory === category.id;
                                    return (
                                        <button
                                            key={category.id}
                                            onClick={() => setActiveCategory(category.id)}
                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all ${isActive
                                                ? 'bg-white/10 text-white'
                                                : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                                }`}
                                        >
                                            <Icon className={`w-5 h-5 ${isActive ? category.color : ''}`} />
                                            <span className="font-medium">{category.label}</span>
                                        </button>
                                    );
                                })}
                            </nav>

                            {/* Divider */}
                            <div className="my-3 border-t border-white/10" />

                            {/* Save Button */}
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${saveStatus === 'saved'
                                    ? 'bg-green-600 text-white'
                                    : saveStatus === 'error'
                                        ? 'bg-red-600 text-white'
                                        : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white'
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : saveStatus === 'saved' ? (
                                    <>
                                        <Check className="w-4 h-4" />
                                        Saved!
                                    </>
                                ) : saveStatus === 'error' ? (
                                    'Failed'
                                ) : (
                                    'Save Changes'
                                )}
                            </button>

                            {/* Sign Out Button */}
                            <button
                                onClick={handleSignOut}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 mt-2 rounded-lg text-red-400 hover:bg-red-600/10 transition-colors"
                            >
                                <LogOut className="w-4 h-4" />
                                Sign Out
                            </button>
                        </div>
                    </motion.aside>

                    {/* Content Area */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="flex-1"
                    >
                        <div className="bg-[#1e1e1e] rounded-xl border border-white/10 overflow-hidden">
                            {/* Content Header */}
                            <div className="p-6 border-b border-white/5">
                                <div className="flex items-center gap-3">
                                    {activeCategoryData && (
                                        <>
                                            <div className={`p-2 rounded-lg bg-white/5 ${activeCategoryData.color}`}>
                                                <activeCategoryData.icon className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h2 className="text-xl font-bold text-white">{activeCategoryData.label}</h2>
                                                <p className="text-sm text-gray-400">
                                                    {activeCategory === 'trading' && 'Configure your default trading behavior'}
                                                    {activeCategory === 'notifications' && 'Control what updates you receive'}
                                                    {activeCategory === 'display' && 'Customize how information is shown'}
                                                    {activeCategory === 'privacy' && 'Control your profile visibility'}
                                                    {activeCategory === 'account' && 'Manage your email, security, and account'}
                                                </p>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Content Body */}
                            <div className="p-6">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={activeCategory}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        {renderContent()}
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </main>

            <EditProfileModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                user={user}
                onSaved={() => setIsEditModalOpen(false)}
            />

            {/* Change Email Modal */}
            <AnimatePresence>
                {showChangeEmailModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
                        onClick={() => setShowChangeEmailModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#1e1e1e] border border-white/10 rounded-xl p-6 max-w-md w-full mx-4"
                        >
                            <h3 className="text-xl font-bold text-white mb-4">Change Email</h3>
                            <p className="text-gray-400 text-sm mb-4">
                                A verification email will be sent to your new address.
                            </p>
                            <input
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder="New email address"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
                            />
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowChangeEmailModal(false)}
                                    className="flex-1 py-3 rounded-lg border border-white/10 text-gray-400 font-medium hover:bg-white/5"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        try {
                                            await email.changeEmail(newEmail);
                                            toast({ title: 'Verification email sent to new address', variant: 'success' });
                                            setShowChangeEmailModal(false);
                                            setNewEmail('');
                                        } catch {
                                            toast({ title: 'Failed to change email', variant: 'destructive' });
                                        }
                                    }}
                                    className="flex-1 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500"
                                >
                                    Send Verification
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 2FA Password Prompt Modal */}
            <AnimatePresence>
                {show2FAPasswordPrompt && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
                        onClick={() => {
                            setShow2FAPasswordPrompt(false);
                            setTwoFAPassword('');
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#1e1e1e] border border-white/10 rounded-xl p-6 max-w-md w-full mx-4"
                        >
                            <h3 className="text-xl font-bold text-white mb-4">Confirm Your Password</h3>
                            <p className="text-gray-400 text-sm mb-4">
                                Enter your password to set up two-factor authentication.
                            </p>
                            <input
                                type="password"
                                value={twoFAPassword}
                                onChange={(e) => setTwoFAPassword(e.target.value)}
                                placeholder="Enter your password"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 mb-4"
                            />
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShow2FAPasswordPrompt(false);
                                        setTwoFAPassword('');
                                    }}
                                    className="flex-1 py-3 rounded-lg border border-white/10 text-gray-400 font-medium hover:bg-white/5"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        try {
                                            // First enable 2FA which generates the secret
                                            const enableResult = await twoFactor.enable(twoFAPassword);
                                            console.log('Enable 2FA result:', enableResult);

                                            if (enableResult?.error) {
                                                toast({ title: enableResult.error.message || 'Failed to enable 2FA', variant: 'destructive' });
                                                return;
                                            }

                                            // Check if totpURI is in the enable response
                                            if (enableResult?.data?.totpURI) {
                                                setTotpUri(enableResult.data.totpURI);
                                                setShow2FAPasswordPrompt(false);
                                                setTwoFAPassword('');
                                                setShow2FASetup(true);
                                                return;
                                            }

                                            // If not, try to get it separately
                                            const uriResult = await twoFactor.getTotpUri(twoFAPassword);
                                            console.log('Get TOTP URI result:', uriResult);

                                            if (uriResult?.data?.totpURI) {
                                                setTotpUri(uriResult.data.totpURI);
                                                setShow2FAPasswordPrompt(false);
                                                setTwoFAPassword('');
                                                setShow2FASetup(true);
                                            } else {
                                                toast({ title: 'Failed to generate 2FA setup. Check your password.', variant: 'destructive' });
                                            }
                                        } catch (err) {
                                            console.error('2FA setup error:', err);
                                            toast({ title: 'Invalid password or 2FA setup failed', variant: 'destructive' });
                                        }
                                    }}
                                    disabled={!twoFAPassword}
                                    className="flex-1 py-3 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-500 disabled:opacity-50"
                                >
                                    Continue
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 2FA Setup Modal */}
            <AnimatePresence>
                {show2FASetup && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
                        onClick={() => setShow2FASetup(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#1e1e1e] border border-white/10 rounded-xl p-6 max-w-md w-full mx-4"
                        >
                            <h3 className="text-xl font-bold text-white mb-4">Set Up Two-Factor Authentication</h3>
                            <p className="text-gray-400 text-sm mb-4">
                                Scan this QR code with your authenticator app (e.g., Google Authenticator, Authy).
                            </p>

                            {/* QR Code */}
                            <div className="bg-white p-4 rounded-lg mb-4 flex items-center justify-center">
                                <div className="text-center">
                                    {totpUri ? (
                                        <QRCodeSVG value={totpUri} size={160} level="M" />
                                    ) : (
                                        <div className="w-40 h-40 bg-gray-200 rounded flex items-center justify-center text-gray-500 text-xs">
                                            Loading...
                                        </div>
                                    )}
                                    <p className="text-xs text-gray-600 mt-2">Scan with authenticator app</p>
                                </div>
                            </div>

                            <p className="text-gray-400 text-sm mb-2">Enter the 6-digit code from your app:</p>
                            <input
                                type="text"
                                value={totpCode}
                                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="000000"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-center text-2xl tracking-widest placeholder-gray-500 focus:outline-none focus:border-purple-500 mb-4"
                                maxLength={6}
                            />
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShow2FASetup(false);
                                        setTotpCode('');
                                    }}
                                    className="flex-1 py-3 rounded-lg border border-white/10 text-gray-400 font-medium hover:bg-white/5"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        try {
                                            const result = await twoFactor.verifyTotp(totpCode);

                                            if (result?.error) {
                                                toast({ title: result.error.message || 'Invalid code', variant: 'destructive' });
                                                return;
                                            }

                                            toast({ title: '2FA enabled successfully!', variant: 'success' });
                                            setIs2FAEnabled(true);
                                            setShow2FASetup(false);
                                            setTotpCode('');
                                        } catch {
                                            toast({ title: 'Invalid code', variant: 'destructive' });
                                        }
                                    }}
                                    disabled={totpCode.length !== 6}
                                    className="flex-1 py-3 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-500 disabled:opacity-50"
                                >
                                    Enable 2FA
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Disable 2FA Modal */}
            <AnimatePresence>
                {showDisable2FAPrompt && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
                        onClick={() => {
                            setShowDisable2FAPrompt(false);
                            setTwoFAPassword('');
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#1e1e1e] border border-white/10 rounded-xl p-6 max-w-md w-full mx-4"
                        >
                            <h3 className="text-xl font-bold text-white mb-4">Disable Two-Factor Authentication</h3>
                            <p className="text-gray-400 text-sm mb-4">
                                Enter your password to disable 2FA. This will make your account less secure.
                            </p>
                            <input
                                type="password"
                                value={twoFAPassword}
                                onChange={(e) => setTwoFAPassword(e.target.value)}
                                placeholder="Enter your password"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500 mb-4"
                            />
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShowDisable2FAPrompt(false);
                                        setTwoFAPassword('');
                                    }}
                                    className="flex-1 py-3 rounded-lg border border-white/10 text-gray-400 font-medium hover:bg-white/5"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        try {
                                            await twoFactor.disable(twoFAPassword);
                                            toast({ title: '2FA disabled', variant: 'success' });
                                            setIs2FAEnabled(false);
                                            setShowDisable2FAPrompt(false);
                                            setTwoFAPassword('');
                                        } catch {
                                            toast({ title: 'Invalid password', variant: 'destructive' });
                                        }
                                    }}
                                    disabled={!twoFAPassword}
                                    className="flex-1 py-3 rounded-lg bg-red-600 text-white font-medium hover:bg-red-500 disabled:opacity-50"
                                >
                                    Disable 2FA
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Delete Account Confirmation Modal */}
            <AnimatePresence>
                {showDeleteConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
                        onClick={() => setShowDeleteConfirm(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#1e1e1e] border border-red-500/30 rounded-xl p-6 max-w-md w-full mx-4"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 rounded-lg bg-red-600/20">
                                    <AlertTriangle className="w-6 h-6 text-red-400" />
                                </div>
                                <h3 className="text-xl font-bold text-white">Delete Account</h3>
                            </div>
                            <p className="text-gray-400 text-sm mb-4">
                                This action cannot be undone. All your data, including bets, balances, and history will be permanently deleted.
                            </p>
                            <p className="text-gray-400 text-sm mb-2">
                                Type <span className="text-red-400 font-mono">DELETE</span> to confirm:
                            </p>
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder="DELETE"
                                className="w-full bg-white/5 border border-red-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500 mb-4"
                            />
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShowDeleteConfirm(false);
                                        setDeleteConfirmText('');
                                    }}
                                    className="flex-1 py-3 rounded-lg border border-white/10 text-gray-400 font-medium hover:bg-white/5"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        try {
                                            // Soft delete - mark account as banned/deleted
                                            await fetch('/api/user/delete', { method: 'POST' });
                                            toast({ title: 'Account deleted', variant: 'success' });
                                            await signOut();
                                            router.push('/');
                                        } catch {
                                            toast({ title: 'Failed to delete account', variant: 'destructive' });
                                        }
                                    }}
                                    disabled={deleteConfirmText !== 'DELETE'}
                                    className="flex-1 py-3 rounded-lg bg-red-600 text-white font-medium hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Delete Forever
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <Footer />
        </div>
    );
}
