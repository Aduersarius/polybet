'use client';

import { useState, useEffect } from 'react';
import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { Send, Link as LinkIcon, Unlink, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function TelegramSettingsPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [linkCode, setLinkCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [linkedAccount, setLinkedAccount] = useState<any>(null);

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/');
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (session) {
      checkLinkStatus();
    }
  }, [session]);

  const checkLinkStatus = async () => {
    try {
      setCheckingStatus(true);
      const response = await fetch('/api/telegram/link');
      
      if (response.ok) {
        const data = await response.json();
        if (data.linked) {
          setLinkedAccount(data);
        }
      }
    } catch (err) {
      console.error('Failed to check link status:', err);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!linkCode || linkCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/telegram/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: linkCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to link account');
      }

      setSuccess('Telegram account linked successfully!');
      setLinkCode('');
      await checkLinkStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link account');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm('Are you sure you want to unlink your Telegram account?')) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/telegram/link', {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to unlink account');
      }

      setSuccess('Telegram account unlinked successfully');
      setLinkedAccount(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink account');
    } finally {
      setLoading(false);
    }
  };

  if (isPending || checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-white p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Send className="w-8 h-8 text-blue-400" />
            Telegram Settings
          </h1>
          <p className="text-white/60">
            Link your Telegram account to receive support notifications
          </p>
        </div>

        {/* Linked Account Status */}
        {linkedAccount ? (
          <div className="p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/20">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">Account Linked</h3>
                  <p className="text-sm text-white/80 mb-2">
                    Your Telegram account is connected
                  </p>
                  <div className="text-xs text-white/60">
                    {linkedAccount.username && (
                      <p>Username: @{linkedAccount.username}</p>
                    )}
                    {linkedAccount.firstName && (
                      <p>Name: {linkedAccount.firstName} {linkedAccount.lastName || ''}</p>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={handleUnlink}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/30 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Unlink className="w-4 h-4" />
                Unlink
              </button>
            </div>
          </div>
        ) : (
          /* Link Form */
          <div className="p-6 rounded-xl bg-white/5 border border-white/10 mb-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <LinkIcon className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-1">Link Telegram Account</h3>
                <p className="text-sm text-white/60">
                  Connect your Telegram to receive support updates
                </p>
              </div>
            </div>

            {/* Instructions */}
            <div className="mb-6 p-4 rounded-lg bg-blue-500/5 border border-blue-500/10">
              <h4 className="text-sm font-semibold text-white mb-2">How to link:</h4>
              <ol className="text-sm text-white/70 space-y-1 list-decimal list-inside">
                <li>Open Telegram and search for our support bot</li>
                <li>Send the <code className="px-1.5 py-0.5 rounded bg-white/10 text-emerald-400">/link</code> command</li>
                <li>Copy the 6-digit code from the bot</li>
                <li>Paste the code below and click "Link Account"</li>
              </ol>
            </div>

            {/* Alerts */}
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>{success}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLink} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={linkCode}
                  onChange={(e) => setLinkCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-center text-2xl font-mono tracking-widest focus:outline-none focus:border-blue-500/50 transition-colors"
                  disabled={loading}
                />
                <p className="mt-2 text-xs text-white/40">Enter the 6-digit code from the Telegram bot</p>
              </div>

              <button
                type="submit"
                disabled={loading || linkCode.length !== 6}
                className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Linking...
                  </>
                ) : (
                  <>
                    <LinkIcon className="w-5 h-5" />
                    Link Account
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Benefits */}
        <div className="p-6 rounded-xl bg-white/5 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-4">Benefits of Linking</h3>
          <ul className="space-y-3 text-sm text-white/70">
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>Receive instant support replies directly in Telegram</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>Get notified when your ticket status changes</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>Create support tickets by messaging the bot</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>View your ticket history with the /ticket command</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>Faster support with access to your account information</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
