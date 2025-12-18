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
  
  // Primary scale
  primary: colorTokens.primary,
  
  // Secondary scale
  secondary: colorTokens.secondary,
  
  // Accent scale
  accent: colorTokens.accent,
  
  // Semantic colors
  error: colorTokens.error,
  warning: colorTokens.warning,
  success: colorTokens.success,
  
  // Neutral scales
  gray: colorTokens.gray,
  zinc: colorTokens.zinc,
  
  // Text colors
  text: colorTokens.text,
  
  // Chart colors
  chart: colorTokens.chart,
} as const;

