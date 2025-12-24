/**
 * Centralized Color System
 * 
 * This is the single source of truth for all colors in the application.
 * Import colors from here instead of hardcoding hex values.
 */

import type { CSSProperties } from 'react';
import { colorTokens } from './tokens';

// Re-export tokens for direct access
export { colorTokens };

// Semantic color aliases for easy access
export const colors = {
  // Backgrounds
  background: colorTokens.background,
  surface: colorTokens.surface,
  surfaceElevated: colorTokens.surfaceElevated || '#22222e',

  // Primary colors
  primary: colorTokens.primary[500],
  primaryLight: colorTokens.primary[400],
  primaryDark: colorTokens.primary[600],

  // Secondary colors
  secondary: colorTokens.secondary[500],
  secondaryLight: colorTokens.secondary[400],
  secondaryDark: colorTokens.secondary[600],

  // Accent colors
  accent: colorTokens.accent[500],
  accentLight: colorTokens.accent[400],
  accentDark: colorTokens.accent[600],

  // Semantic colors
  error: colorTokens.error[500],
  errorLight: colorTokens.error[400],
  errorDark: colorTokens.error[600],

  warning: colorTokens.warning[500],
  warningLight: colorTokens.warning[400],
  warningDark: colorTokens.warning[600],

  success: colorTokens.success[500],
  successLight: colorTokens.success[400],
  successDark: colorTokens.success[600],

  // Text colors
  text: {
    primary: colorTokens.text.primary,
    secondary: colorTokens.text.secondary,
    muted: colorTokens.text.muted,
    inverse: colorTokens.text.inverse,
  },

  // Chart colors
  chart: colorTokens.chart,

  // Outcome colors
  outcomes: colorTokens.outcomes,

  // Category colors
  categories: colorTokens.categories,

  // Gray scale
  gray: colorTokens.gray,
  zinc: colorTokens.zinc,
} as const;

/**
 * Get category color classes for Tailwind
 * Returns Tailwind class string for category styling
 */
export function getCategoryColorClasses(category: string): string {
  // Safety check: handle null/undefined/empty
  if (!category || typeof category !== 'string') {
    return '!text-gray-400 border-gray-500/30 bg-gray-500/10';
  }

  // Normalize: trim whitespace and convert to uppercase
  const cat = category.trim().toUpperCase();

  // Normalize category names (handle variations and aliases)
  let normalizedCat = cat;

  // Handle ECONOMICS -> ECONOMY
  if (cat === 'ECONOMICS' || cat === 'ECONOMIC') {
    normalizedCat = 'ECONOMY';
  }
  // Handle POP CULTURE -> CULTURE
  else if (cat === 'POP CULTURE' || cat === 'POPCULTURE') {
    normalizedCat = 'CULTURE';
  }
  // Handle ESPORTS -> SPORTS (or keep ESPORTS if you want separate styling)
  else if (cat === 'ESPORTS' || cat === 'E-SPORTS' || cat === 'E SPORTS') {
    normalizedCat = 'ESPORTS'; // Keep as ESPORTS (has same color as SPORTS)
  }

  // Map categories to Tailwind classes
  const categoryMap: Record<string, string> = {
    'CRYPTO': 'text-amber-400 border-amber-500/30 bg-amber-500/10',
    'SPORTS': 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    'ESPORTS': 'text-purple-500 border-purple-500/30 bg-purple-500/10',
    'POLITICS': 'text-blue-400 border-blue-500/30 bg-blue-500/10',
    'ELECTIONS': 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
    'ELECTION': 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10', // Singular form
    'TECH': 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
    'TECHNOLOGY': 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10', // Full form
    'BUSINESS': 'text-purple-400 border-purple-500/30 bg-purple-500/10',
    'FINANCE': 'text-green-400 border-green-500/30 bg-green-500/10',
    'SCIENCE': 'text-pink-400 border-pink-500/30 bg-pink-500/10',
    'CULTURE': 'text-rose-400 border-rose-500/30 bg-rose-500/10',
    'ECONOMY': 'text-teal-400 border-teal-500/30 bg-teal-500/10',
    'WORLD': 'text-violet-400 border-violet-500/30 bg-violet-500/10',
  };

  const colorClasses = categoryMap[normalizedCat] || 'text-gray-400 border-gray-500/30 bg-gray-500/10';

  // Debug logging (remove in production if needed)
  if (process.env.NODE_ENV === 'development' && !categoryMap[normalizedCat]) {
    console.warn(`[Category Colors] No color mapping found for category: "${category}" (normalized: "${normalizedCat}")`);
  }

  return colorClasses;
}

/**
 * Get category color object (for inline styles)
 */
export function getCategoryColor(category: string): { text: string; border: string; bg: string } {
  // Safety check: handle null/undefined/empty
  if (!category || typeof category !== 'string') {
    return colorTokens.categories.DEFAULT;
  }

  // Normalize: trim whitespace and convert to uppercase
  const cat = category.trim().toUpperCase();

  // Normalize category names (handle variations and aliases)
  let normalizedCat = cat;

  // Handle ECONOMICS -> ECONOMY
  if (cat === 'ECONOMICS' || cat === 'ECONOMIC') {
    normalizedCat = 'ECONOMY';
  }
  // Handle POP CULTURE -> CULTURE
  else if (cat === 'POP CULTURE' || cat === 'POPCULTURE') {
    normalizedCat = 'CULTURE';
  }
  // Handle ESPORTS -> SPORTS (or keep ESPORTS if you want separate styling)
  else if (cat === 'ESPORTS' || cat === 'E-SPORTS' || cat === 'E SPORTS') {
    normalizedCat = 'ESPORTS'; // Keep as ESPORTS (has same color as SPORTS)
  }

  const categoryKey = normalizedCat as keyof typeof colorTokens.categories;
  const colorObj = (colorTokens.categories[categoryKey] || colorTokens.categories.DEFAULT) as { text: string; border: string; bg: string };
  return colorObj;
}

/**
 * Get outcome color by index
 */
export function getOutcomeColor(index: number): string {
  return colorTokens.outcomes[index % colorTokens.outcomes.length];
}

/**
 * Generate CSS variables object for :root
 */
export function getCSSVariables() {
  return {
    '--background': colorTokens.background,
    '--surface': colorTokens.surface,
    '--primary': colorTokens.primary[500],
    '--secondary': colorTokens.secondary[500],
    '--accent': colorTokens.accent[500],
    '--error': colorTokens.error[500],
    '--success': colorTokens.success[500],
    '--warning': colorTokens.warning[500],
    '--on-background': colorTokens.text.primary,
    '--on-surface': colorTokens.text.primary,
    '--on-primary': colorTokens.text.primary,
    '--foreground-rgb': '255, 255, 255',
    '--background-start-rgb': '24, 24, 27',
    '--background-end-rgb': '24, 24, 27',
    '--chart-1': '217 91% 60%',
    '--chart-2': '158 64% 52%',
    '--chart-3': '43 96% 56%',
    '--chart-4': '262 83% 58%',
    '--chart-5': '338 78% 56%',
  };
}

/**
 * Helper to convert hex to rgb for rgba usage
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    }
    : null;
}

/**
 * Helper to create rgba string from hex and opacity
 */
export function rgba(hex: string, opacity: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

/**
 * Helper to create inline style object for dynamic colors
 * Use this when you need to use colors dynamically in Tailwind classes
 */
export function getColorStyle(color: string, opacity?: number): CSSProperties {
  if (opacity !== undefined) {
    return { color: rgba(color, opacity) };
  }
  return { color };
}

/**
 * Helper to create background style with opacity
 */
export function getBgStyle(color: string, opacity?: number): CSSProperties {
  if (opacity !== undefined) {
    return { backgroundColor: rgba(color, opacity) };
  }
  return { backgroundColor: color };
}

/**
 * Helper to create border style with opacity
 */
export function getBorderStyle(color: string, opacity?: number): CSSProperties {
  if (opacity !== undefined) {
    return { borderColor: rgba(color, opacity) };
  }
  return { borderColor: color };
}

/**
 * Helper to desaturate/mute a hex color
 */
export function muteColor(hex: string, desaturation: number = 0.4): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const grayR = 128, grayG = 128, grayB = 128;
  const mutedR = Math.round(r * (1 - desaturation) + grayR * desaturation);
  const mutedG = Math.round(g * (1 - desaturation) + grayG * desaturation);
  const mutedB = Math.round(b * (1 - desaturation) + grayB * desaturation);
  return `#${mutedR.toString(16).padStart(2, '0')}${mutedG.toString(16).padStart(2, '0')}${mutedB.toString(16).padStart(2, '0')}`;
}

/**
 * Helper to darken a hex color
 */
export function darkenColor(hex: string, percent: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const newR = Math.max(0, Math.min(255, Math.floor(r * (1 - percent))));
  const newG = Math.max(0, Math.min(255, Math.floor(g * (1 - percent))));
  const newB = Math.max(0, Math.min(255, Math.floor(b * (1 - percent))));
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}
