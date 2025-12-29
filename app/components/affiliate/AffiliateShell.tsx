'use client';

import { ReactNode, useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Link2,
  Tag,
  Image,
  BarChart3,
  LogOut,
  User,
  DollarSign,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface AffiliateShellProps {
  children: ReactNode;
  affiliateInfo?: {
    name: string;
    email: string;
    referralCode: string;
  } | null;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/affiliate/dashboard' },
  { id: 'links', label: 'Links', icon: Link2, href: '/affiliate/dashboard/links' },
  { id: 'codes', label: 'Codes', icon: Tag, href: '/affiliate/dashboard/codes' },
  { id: 'promo-materials', label: 'Promo Materials', icon: Image, href: '/affiliate/dashboard/promo-materials' },
  { id: 'statistics', label: 'Statistics', icon: BarChart3, href: '/affiliate/dashboard/statistics' },
];

export function AffiliateShell({ children, affiliateInfo }: AffiliateShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('affiliate-sidebar-open');
    if (saved !== null) {
      setSidebarOpen(saved === 'true');
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem('affiliate-sidebar-open', String(sidebarOpen));
    }
  }, [sidebarOpen, mounted]);

  const handleLogout = () => {
    document.cookie = 'affiliate_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
    router.push('/affiliate/login');
  };

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-[#e4e4e7]">
      <div className="flex">
        <aside
          className={cn(
            'fixed left-0 top-0 h-full bg-[#111113] border-r border-white/5 px-4 py-6 flex flex-col gap-6 transition-all duration-300 z-30',
            sidebarOpen ? 'w-64' : 'w-16'
          )}
        >
          <div className="px-2 flex items-center justify-between">
            {sidebarOpen && (
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[#9ca3af]">PolyBet</div>
                <div className="text-xl font-semibold text-white mt-1">Partners</div>
              </div>
            )}
            {!sidebarOpen && (
              <div className="text-xs uppercase tracking-[0.2em] text-[#9ca3af]">PB</div>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white"
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          </div>

          <nav className="flex flex-col gap-1 flex-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || 
                (item.href !== '/affiliate/dashboard' && pathname.startsWith(item.href));
              
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors border border-transparent',
                    isActive
                      ? 'bg-white/5 border-white/5 text-white shadow-sm'
                      : 'text-gray-300 hover:bg-white/5 hover:text-white',
                    !sidebarOpen && 'justify-center'
                  )}
                  title={!sidebarOpen ? item.label : undefined}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {sidebarOpen && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          {sidebarOpen && affiliateInfo && (
            <div className="px-2 py-4 border-t border-white/5 space-y-3">
              <div className="text-xs text-[#9ca3af] mb-2">Account</div>
              <div className="text-sm text-gray-300 truncate">{affiliateInfo.name}</div>
              <div className="text-xs text-gray-400 truncate">{affiliateInfo.email}</div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#9ca3af]">Code:</span>
                <span className="font-mono text-white">{affiliateInfo.referralCode}</span>
              </div>
            </div>
          )}

          <div className="px-2">
            <button
              onClick={handleLogout}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors text-gray-300 hover:bg-white/5 hover:text-white',
                !sidebarOpen && 'justify-center'
              )}
              title={!sidebarOpen ? 'Logout' : undefined}
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              {sidebarOpen && <span>Logout</span>}
            </button>
          </div>
        </aside>

        <div
          className={cn(
            'flex-1 transition-all duration-300',
            sidebarOpen ? 'pl-64' : 'pl-16'
          )}
        >
          <header className="sticky top-0 z-20 bg-[#0b0b0f]/90 backdrop-blur border-b border-white/5">
            <div className="px-4 md:px-8 py-4 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex items-center gap-4">
                {affiliateInfo && (
                  <>
                    <div className="hidden md:flex items-center gap-2 text-sm">
                      <span className="text-[#9ca3af]">Revshare:</span>
                      <span className="text-[#8b5cf6] font-medium">50%</span>
                    </div>
                    <div className="hidden md:flex items-center gap-2 text-sm">
                      <DollarSign className="w-4 h-4 text-[#9ca3af]" />
                      <span className="font-medium">0 $</span>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                  <User className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>
          </header>

          <main className="px-4 md:px-8 py-4">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

