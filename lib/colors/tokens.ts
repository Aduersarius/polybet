/**
 * Color Tokens - Raw color values
 * All color definitions should be centralized here
 */

export const colorTokens = {
  // Base Colors - 2026 Design System
  // Premium Navy Rich Theme: Deep, sophisticated navy blues - no green
  background: '#111827', // gray-900
  surface: '#1a1d28', // Elevated surface with rich navy undertones - premium contrast
  surfaceElevated: '#232736', // Higher elevation for modals/dialogs - lighter navy

  // Primary Brand Colors - Premium Navy Blue
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6', // Main primary - vibrant trust blue
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },

  // Secondary (Success/Emerald)
  secondary: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981', // Main secondary
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
  },

  // Accent (Purple)
  accent: {
    50: '#faf5ff',
    100: '#f3e8ff',
    200: '#e9d5ff',
    300: '#d8b4fe',
    400: '#c084fc',
    500: '#8b5cf6', // Main accent
    600: '#7c3aed',
    700: '#6d28d9',
    800: '#5b21b6',
    900: '#4c1d95',
  },

  // Semantic Colors
  error: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444', // Main error
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },

  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b', // Main warning
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
  },

  success: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981', // Main success (same as secondary)
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
  },

  // Neutral/Gray Scale
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },

  zinc: {
    50: '#fafafa',
    100: '#f4f4f5',
    200: '#e4e4e7',
    300: '#d4d4d8',
    400: '#a1a1aa',
    500: '#71717a',
    600: '#52525b',
    700: '#3f3f46',
    800: '#1a1d28', // Updated to match surface color - rich navy
    900: '#0f1117', // Updated to match background color - premium deep navy
  },

  // Text Colors
  text: {
    primary: '#ffffff',
    secondary: '#a1a1aa',
    muted: '#71717a',
    inverse: '#18181b',
  },

  // Chart Colors
  chart: {
    1: '#3b82f6', // Blue
    2: '#10b981', // Green
    3: '#f59e0b', // Orange
    4: '#8b5cf6', // Purple
    5: '#ef4444', // Red
    6: '#06b6d4', // Cyan
    7: '#ec4899', // Pink
    8: '#6366f1', // Indigo
    9: '#14b8a6', // Teal
    10: '#f43f5e', // Rose
  },

  // Outcome Colors (for charts/trading)
  outcomes: [
    '#BB86FC', // Primary purple
    '#03DAC6', // Cyan/Teal
    '#CF6679', // Pink/Red
    '#8B5CF6', // Secondary purple
    '#10B981', // Green
    '#F59E0B', // Orange
    '#3B82F6', // Blue
    '#EC4899', // Pink
    '#6366F1', // Indigo
    '#14B8A6', // Teal
    '#F43F5E', // Rose
    '#84CC16', // Lime
    '#D946EF', // Fuchsia
    '#06B6D4', // Cyan
  ],

  // Category Colors (semantic mapping)
  categories: {
    CRYPTO: {
      text: '#fbbf24', // amber-400
      border: 'rgba(245, 158, 11, 0.3)', // amber-500/30
      bg: 'rgba(245, 158, 11, 0.1)', // amber-500/10
    },
    SPORTS: {
      text: '#34d399', // emerald-400
      border: 'rgba(16, 185, 129, 0.3)', // emerald-500/30
      bg: 'rgba(16, 185, 129, 0.1)', // emerald-500/10
    },
    POLITICS: {
      text: '#60a5fa', // blue-400
      border: 'rgba(59, 130, 246, 0.3)', // blue-500/30
      bg: 'rgba(59, 130, 246, 0.1)', // blue-500/10
    },
    ELECTIONS: {
      text: '#818cf8', // indigo-400
      border: 'rgba(99, 102, 241, 0.3)', // indigo-500/30
      bg: 'rgba(99, 102, 241, 0.1)', // indigo-500/10
    },
    TECH: {
      text: '#22d3ee', // cyan-400
      border: 'rgba(6, 182, 212, 0.3)', // cyan-500/30
      bg: 'rgba(6, 182, 212, 0.1)', // cyan-500/10
    },
    BUSINESS: {
      text: '#c084fc', // purple-400
      border: 'rgba(139, 92, 246, 0.3)', // purple-500/30
      bg: 'rgba(139, 92, 246, 0.1)', // purple-500/10
    },
    FINANCE: {
      text: '#4ade80', // green-400
      border: 'rgba(34, 197, 94, 0.3)', // green-500/30
      bg: 'rgba(34, 197, 94, 0.1)', // green-500/10
    },
    SCIENCE: {
      text: '#f472b6', // pink-400
      border: 'rgba(236, 72, 153, 0.3)', // pink-500/30
      bg: 'rgba(236, 72, 153, 0.1)', // pink-500/10
    },
    CULTURE: {
      text: '#fb7185', // rose-400
      border: 'rgba(244, 63, 94, 0.3)', // rose-500/30
      bg: 'rgba(244, 63, 94, 0.1)', // rose-500/10
    },
    ECONOMY: {
      text: '#2dd4bf', // teal-400
      border: 'rgba(20, 184, 166, 0.3)', // teal-500/30
      bg: 'rgba(20, 184, 166, 0.1)', // teal-500/10
    },
    WORLD: {
      text: '#a78bfa', // violet-400
      border: 'rgba(139, 92, 246, 0.3)', // violet-500/30
      bg: 'rgba(139, 92, 246, 0.1)', // violet-500/10
    },
    ESPORTS: {
      text: '#a855f7', // purple-500
      border: 'rgba(168, 85, 247, 0.3)', // purple-500/30
      bg: 'rgba(168, 85, 247, 0.1)', // purple-500/10
    },
    DEFAULT: {
      text: '#9ca3af', // gray-400
      border: 'rgba(107, 114, 128, 0.3)', // gray-500/30
      bg: 'rgba(107, 114, 128, 0.1)', // gray-500/10
    },
  },
} as const;

