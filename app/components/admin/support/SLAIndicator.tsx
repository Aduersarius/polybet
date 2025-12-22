'use client';

import { Clock, AlertCircle, CheckCircle } from 'lucide-react';

interface SLAIndicatorProps {
  createdAt: string;
  firstResponseAt?: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'pending' | 'resolved' | 'closed';
  size?: 'sm' | 'md';
}

const SLA_TARGETS = {
  low: { responseMinutes: 240, label: '4 hours' },
  medium: { responseMinutes: 120, label: '2 hours' },
  high: { responseMinutes: 60, label: '1 hour' },
  critical: { responseMinutes: 30, label: '30 min' },
};

export function SLAIndicator({ createdAt, firstResponseAt, priority, status, size = 'md' }: SLAIndicatorProps) {
  const target = SLA_TARGETS[priority];
  const createdTime = new Date(createdAt).getTime();
  const respondedTime = firstResponseAt ? new Date(firstResponseAt).getTime() : null;
  const currentTime = Date.now();

  // Calculate response time
  const elapsedMinutes = Math.floor((currentTime - createdTime) / 1000 / 60);
  const responseTime = respondedTime ? Math.floor((respondedTime - createdTime) / 1000 / 60) : null;

  // Determine SLA status
  let slaStatus: 'met' | 'warning' | 'overdue' | 'pending';
  let color: string;
  let bgColor: string;
  let borderColor: string;
  let Icon: any;

  if (status === 'closed' || status === 'resolved') {
    slaStatus = 'met';
    color = 'text-emerald-400';
    bgColor = 'bg-emerald-500/10';
    borderColor = 'border-emerald-500/20';
    Icon = CheckCircle;
  } else if (firstResponseAt) {
    // Already responded
    if (responseTime! <= target.responseMinutes) {
      slaStatus = 'met';
      color = 'text-emerald-400';
      bgColor = 'bg-emerald-500/10';
      borderColor = 'border-emerald-500/20';
      Icon = CheckCircle;
    } else {
      slaStatus = 'met'; // Late but responded
      color = 'text-blue-400';
      bgColor = 'bg-blue-500/10';
      borderColor = 'border-blue-500/20';
      Icon = CheckCircle;
    }
  } else {
    // Still waiting for response
    const percentElapsed = (elapsedMinutes / target.responseMinutes) * 100;

    if (percentElapsed >= 100) {
      slaStatus = 'overdue';
      color = 'text-red-400';
      bgColor = 'bg-red-500/10';
      borderColor = 'border-red-500/20';
      Icon = AlertCircle;
    } else if (percentElapsed >= 75) {
      slaStatus = 'warning';
      color = 'text-yellow-400';
      bgColor = 'bg-yellow-500/10';
      borderColor = 'border-yellow-500/20';
      Icon = Clock;
    } else {
      slaStatus = 'pending';
      color = 'text-gray-400';
      bgColor = 'bg-gray-500/10';
      borderColor = 'border-gray-500/20';
      Icon = Clock;
    }
  }

  const displayTime = responseTime !== null ? `${responseTime}m` : `${elapsedMinutes}m`;

  if (size === 'sm') {
    return (
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md ${bgColor} ${borderColor} border text-xs ${color}`}>
        <Icon className="w-3 h-3" />
        <span>{displayTime}</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${bgColor} ${borderColor} border ${color}`}>
      <Icon className="w-4 h-4" />
      <div className="text-sm">
        <span className="font-medium">{displayTime}</span>
        <span className="text-white/40 ml-1">/ {target.label}</span>
      </div>
    </div>
  );
}
