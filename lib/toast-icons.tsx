import {
  Wallet,
  Lock,
  ShieldAlert,
  AlertTriangle,
  TrendingUp,
  AlertCircle,
  Clock,
  AlertOctagon,
  Calendar,
  CalendarX,
  Info,
  Shield,
  DollarSign,
  MapPin,
  Hash,
  SearchX,
  Flag,
  WifiOff,
  Server,
  Database,
  CheckCircle,
  TrendingDown,
} from 'lucide-react';

export const ToastIcons = {
  wallet: Wallet,
  lock: Lock,
  'shield-alert': ShieldAlert,
  'alert-triangle': AlertTriangle,
  'trending-up': TrendingUp,
  'alert-circle': AlertCircle,
  clock: Clock,
  'alert-octagon': AlertOctagon,
  calendar: Calendar,
  'calendar-x': CalendarX,
  info: Info,
  shield: Shield,
  'dollar-sign': DollarSign,
  'map-pin': MapPin,
  hash: Hash,
  'search-x': SearchX,
  flag: Flag,
  'wifi-off': WifiOff,
  server: Server,
  database: Database,
  'check-circle': CheckCircle,
  'trending-down': TrendingDown,
} as const;

export type ToastIconName = keyof typeof ToastIcons;

interface ToastIconProps {
  name?: ToastIconName | string;
  className?: string;
}

export function ToastIcon({ name, className = 'w-5 h-5' }: ToastIconProps) {
  if (!name || !(name in ToastIcons)) {
    return <AlertCircle className={className} />;
  }
  
  const Icon = ToastIcons[name as ToastIconName];
  return <Icon className={className} />;
}

