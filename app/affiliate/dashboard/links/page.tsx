'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Check, ExternalLink } from 'lucide-react';

interface LinksResponse {
  referralLink: string;
}

export default function AffiliateLinksPage() {
  const router = useRouter();
  const [data, setData] = useState<LinksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');

  useEffect(() => {
    fetchLinks();
  }, []);

  const fetchLinks = async () => {
    try {
      const response = await fetch('/api/affiliate/links', {
        credentials: 'include',
      });

      if (response.status === 401) {
        router.push('/affiliate/login');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch links');
      }

      const result = await response.json();
      setData(result);
    } catch (err: any) {
      console.error('Error fetching links:', err);
      setError(err.message || 'Failed to load links');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateLinkWithUtm = () => {
    if (!data?.referralLink) return '';
    
    const url = new URL(data.referralLink);
    if (utmSource) url.searchParams.set('utm_source', utmSource);
    if (utmMedium) url.searchParams.set('utm_medium', utmMedium);
    if (utmCampaign) url.searchParams.set('utm_campaign', utmCampaign);
    
    return url.toString();
  };

  const customLink = generateLinkWithUtm();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-white/5 bg-surface p-6">
          <div className="h-24 rounded-lg bg-white/5 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-200 mb-2">Referral Links</h1>
        <p className="text-sm text-[#9ca3af]">Manage your referral links and track performance</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Base Referral Link */}
      <div className="rounded-xl border border-white/5 bg-surface p-6">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">Base Referral Link</h2>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={data?.referralLink || ''}
            readOnly
            className="flex-1 px-4 py-3 bg-white/5 border border-white/5 rounded-lg text-zinc-200 text-sm"
          />
          <button
            onClick={() => copyToClipboard(data?.referralLink || '')}
            className="px-4 py-3 bg-white text-black rounded-lg transition-colors hover:bg-gray-200 flex items-center space-x-2 font-medium"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy</span>
              </>
            )}
          </button>
          <a
            href={data?.referralLink}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-colors"
          >
            <ExternalLink className="w-4 h-4 text-zinc-300" />
          </a>
        </div>
      </div>

      {/* UTM Parameter Generator */}
      <div className="rounded-xl border border-white/5 bg-surface p-6">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">Generate Link with UTM Parameters</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              UTM Source
            </label>
            <input
              type="text"
              value={utmSource}
              onChange={(e) => setUtmSource(e.target.value)}
              placeholder="e.g., facebook, google, email"
              className="w-full px-4 py-3 bg-white/5 border border-white/5 rounded-lg text-zinc-200 placeholder-[#9ca3af] focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              UTM Medium
            </label>
            <input
              type="text"
              value={utmMedium}
              onChange={(e) => setUtmMedium(e.target.value)}
              placeholder="e.g., cpc, banner, social"
              className="w-full px-4 py-3 bg-white/5 border border-white/5 rounded-lg text-zinc-200 placeholder-[#9ca3af] focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              UTM Campaign
            </label>
            <input
              type="text"
              value={utmCampaign}
              onChange={(e) => setUtmCampaign(e.target.value)}
              placeholder="e.g., summer2024, launch"
              className="w-full px-4 py-3 bg-white/5 border border-white/5 rounded-lg text-zinc-200 placeholder-[#9ca3af] focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-colors"
            />
          </div>
          {customLink && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Generated Link
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={customLink}
                  readOnly
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/5 rounded-lg text-zinc-200 text-sm"
                />
                <button
                  onClick={() => copyToClipboard(customLink)}
                  className="px-4 py-3 bg-white text-black rounded-lg transition-colors hover:bg-gray-200 flex items-center space-x-2 font-medium"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info Section */}
      <div className="rounded-xl border border-white/5 bg-surface p-6">
        <h3 className="text-lg font-semibold text-zinc-200 mb-2">How to Use Referral Links</h3>
        <ul className="space-y-2 text-[#9ca3af] text-sm">
          <li>• Share your base referral link anywhere to track referrals</li>
          <li>• Use UTM parameters to track different marketing channels</li>
          <li>• All clicks and signups will be attributed to your account</li>
          <li>• Check the Statistics page to see detailed performance metrics</li>
        </ul>
      </div>
    </div>
  );
}
