'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Copy, Check, Image as ImageIcon } from 'lucide-react';

interface PromoMaterial {
  id: string;
  name: string;
  category: 'banner' | 'badge' | 'logo';
  format: 'square' | 'vertical' | 'horizontal';
  dimensions: string;
  url: string;
  embedCode: string;
}

export default function PromoMaterialsPage() {
  const router = useRouter();
  const [materials, setMaterials] = useState<PromoMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'banner' | 'badge' | 'logo'>('all');

  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    try {
      const response = await fetch('/api/affiliate/promo-materials', {
        credentials: 'include',
      });

      if (response.status === 401) {
        router.push('/affiliate/login');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch materials');
      }

      const result = await response.json();
      setMaterials(result.materials || []);
    } catch (err: any) {
      console.error('Error fetching materials:', err);
      setError(err.message || 'Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadImage = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredMaterials = selectedCategory === 'all'
    ? materials
    : materials.filter(m => m.category === selectedCategory);

  const categories = [
    { value: 'all', label: 'All' },
    { value: 'badge', label: 'Badges' },
    { value: 'banner', label: 'Banners' },
    { value: 'logo', label: 'Logos' },
  ] as const;

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
        <h1 className="text-2xl font-semibold text-zinc-200 mb-2">Promo Materials</h1>
        <p className="text-sm text-[#9ca3af]">Download banner badges for reels, TikTok, and social media</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Category Filter */}
      <div className="flex space-x-2">
        {categories.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setSelectedCategory(cat.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedCategory === cat.value
                ? 'bg-white text-black'
                : 'bg-white/5 text-[#9ca3af] hover:text-zinc-200 hover:bg-white/10'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Materials Grid */}
      {filteredMaterials.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-surface p-12 text-center">
          <ImageIcon className="w-12 h-12 text-[#9ca3af] mx-auto mb-4" />
          <p className="text-[#9ca3af]">No materials available in this category</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMaterials.map((material) => (
            <div
              key={material.id}
              className="rounded-xl border border-white/5 bg-surface p-6"
            >
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-zinc-200 mb-1">{material.name}</h3>
                <div className="flex items-center space-x-2 text-sm text-[#9ca3af]">
                  <span className="px-2 py-1 bg-white/5 rounded text-[#8b5cf6]">
                    {material.category}
                  </span>
                  <span>{material.dimensions}</span>
                </div>
              </div>

              {/* Preview */}
              <div className="mb-4 bg-white/5 rounded-lg p-4 flex items-center justify-center min-h-[200px]">
                <div className="text-center">
                  <ImageIcon className="w-16 h-16 text-white/10 mx-auto mb-2" />
                  <p className="text-sm text-[#9ca3af]">{material.format}</p>
                  <p className="text-xs text-white/20">{material.dimensions}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <button
                  onClick={() => downloadImage(material.url, material.name)}
                  className="w-full px-4 py-2 bg-white text-black rounded-lg transition-colors hover:bg-gray-200 flex items-center justify-center space-x-2 font-semibold"
                >
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </button>
                <button
                  onClick={() => copyToClipboard(material.url, `${material.id}-url`)}
                  className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-colors flex items-center justify-center space-x-2 text-zinc-200"
                >
                  {copied === `${material.id}-url` ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Copied URL!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy URL</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => copyToClipboard(material.embedCode, `${material.id}-embed`)}
                  className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-colors flex items-center justify-center space-x-2 text-zinc-200"
                >
                  {copied === `${material.id}-embed` ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Copied Code!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Embed Code</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Section */}
      <div className="rounded-xl border border-white/5 bg-surface p-6">
        <h3 className="text-lg font-semibold text-zinc-200 mb-2">How to Use Promo Materials</h3>
        <ul className="space-y-2 text-[#9ca3af] text-sm">
          <li>• Download badges optimized for reels and TikTok (1080x1080)</li>
          <li>• Use vertical banners for Instagram Stories (1080x1920)</li>
          <li>• All materials include your referral code automatically</li>
          <li>• Copy the embed code to use in websites or blogs</li>
          <li>• Share on social media to track referrals</li>
        </ul>
      </div>
    </div>
  );
}
