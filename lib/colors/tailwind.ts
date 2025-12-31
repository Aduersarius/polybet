/**
 * Tailwind Color Configuration
 * 
 * This exports colors in a format that can be used in tailwind.config.ts
 */

import { colorTokens } from './tokens';

export const tailwindColors = {
  // Background colors
  background: colorTokens.background,
  surface: colorTokens.surface,
  surfaceElevated: colorTokens.surfaceElevated,

  // Primary scale
  primary: {
    ...colorTokens.primary,
    DEFAULT: colorTokens.primary[500],
  },

  // Secondary scale
  secondary: {
    ...colorTokens.secondary,
    DEFAULT: colorTokens.secondary[500],
  },

  // Accent scale
  accent: {
    ...colorTokens.accent,
    DEFAULT: colorTokens.accent[500],
  },

  // Semantic colors
  error: {
    ...colorTokens.error,
    DEFAULT: colorTokens.error[500],
  },
  warning: {
    ...colorTokens.warning,
    DEFAULT: colorTokens.warning[500],
  },
  success: {
    ...colorTokens.success,
    DEFAULT: colorTokens.success[500],
  },

  // Neutral scales
  gray: {
    ...colorTokens.gray,
    DEFAULT: colorTokens.gray[800],
  },
  zinc: {
    ...colorTokens.zinc,
    DEFAULT: colorTokens.zinc[800],
  },

  // Text colors
  text: colorTokens.text,

  // Chart colors
  chart: colorTokens.chart,
} as const;



