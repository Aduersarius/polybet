'use client';

import '../globals.css';
import { useEffect, useState, Suspense } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AffiliateShell } from '../components/affiliate/AffiliateShell';

interface AffiliateInfo {
  name: string;
  email: string;
  referralCode: string;
}

function AffiliateLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [affiliate, setAffiliate] = useState<AffiliateInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Don't show nav on login/signup pages
  const isAuthPage = pathname === '/affiliate/login' || pathname === '/affiliate/signup';

  useEffect(() => {
    if (!isAuthPage) {
      fetchAffiliateInfo();
    } else {
      setLoading(false);
    }
  }, [isAuthPage]);

  const fetchAffiliateInfo = async () => {
    try {
      const response = await fetch('/api/affiliate/dashboard/stats', {
        credentials: 'include',
      });

      if (response.status === 401) {
        router.push('/affiliate/login');
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setAffiliate({
          name: data.affiliateName || 'Affiliate',
          email: data.affiliateEmail || '',
          referralCode: data.affiliateCode || '',
        });
      }
    } catch (error) {
      console.error('Failed to fetch affiliate info:', error);
    } finally {
      setLoading(false);
    }
  };

  if (isAuthPage) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0b0f] text-[#e4e4e7] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <AffiliateShell affiliateInfo={affiliate}>
      {children}
    </AffiliateShell>
  );
}

export default function AffiliateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0b0b0f] text-[#e4e4e7] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    }>
      <AffiliateLayoutContent>{children}</AffiliateLayoutContent>
    </Suspense>
  );
}
