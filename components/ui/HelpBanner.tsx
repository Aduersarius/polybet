"use client"

import { Info, X, Lightbulb, AlertCircle, HelpCircle } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface HelpBannerProps {
  title?: string;
  message: string | React.ReactNode;
  type?: 'info' | 'tip' | 'warning' | 'help';
  dismissible?: boolean;
  className?: string;
  storageKey?: string; // Key for localStorage to remember dismissal
}

export function HelpBanner({ 
  title, 
  message, 
  type = 'info', 
  dismissible = true,
  className = '',
  storageKey
}: HelpBannerProps) {
  const [isDismissed, setIsDismissed] = useState(() => {
    if (storageKey && typeof window !== 'undefined') {
      return localStorage.getItem(`help-banner-${storageKey}`) === 'dismissed';
    }
    return false;
  });

  const handleDismiss = () => {
    setIsDismissed(true);
    if (storageKey && typeof window !== 'undefined') {
      localStorage.setItem(`help-banner-${storageKey}`, 'dismissed');
    }
  };

  if (isDismissed) return null;

  const typeConfig = {
    info: {
      icon: Info,
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      textColor: 'text-blue-300',
      iconColor: 'text-blue-400',
    },
    tip: {
      icon: Lightbulb,
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
      textColor: 'text-emerald-300',
      iconColor: 'text-emerald-400',
    },
    warning: {
      icon: AlertCircle,
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      textColor: 'text-amber-300',
      iconColor: 'text-amber-400',
    },
    help: {
      icon: HelpCircle,
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/20',
      textColor: 'text-purple-300',
      iconColor: 'text-purple-400',
    },
  };

  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div className={cn(
      'rounded-lg p-4 border backdrop-blur-sm',
      config.bgColor,
      config.borderColor,
      className
    )}>
      <div className="flex items-start gap-3">
        <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', config.iconColor)} />
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className={cn('text-sm font-medium mb-1', config.textColor)}>
              {title}
            </h4>
          )}
          <div className={cn('text-sm leading-relaxed', config.textColor)}>
            {message}
          </div>
        </div>
        {dismissible && (
          <button
            onClick={handleDismiss}
            className={cn(
              'flex-shrink-0 p-1 rounded hover:bg-white/10 transition-colors',
              config.textColor
            )}
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

