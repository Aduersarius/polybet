import type { Config } from "tailwindcss";

// Inlined tokens to avoid build resolution issues
const colorTokens = {
    background: '#111827',
    surface: '#1a1d28',
    surfaceElevated: '#232736',
    primary: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a' },
    secondary: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b' },
    accent: { 50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe', 400: '#c084fc', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95' },
    error: { 50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d' },
    warning: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f' },
    success: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b' },
    gray: { 50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db', 400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827' },
    zinc: { 50: '#fafafa', 100: '#f4f4f5', 200: '#e4e4e7', 300: '#d4d4d8', 400: '#a1a1aa', 500: '#71717a', 600: '#52525b', 700: '#3f3f46', 800: '#1a1d28', 900: '#0f1117' },
    text: { primary: '#ffffff', secondary: '#a1a1aa', muted: '#71717a', inverse: '#18181b' },
    chart: { 1: '#3b82f6', 2: '#10b981', 3: '#f59e0b', 4: '#8b5cf6', 5: '#ef4444', 6: '#06b6d4', 7: '#ec4899', 8: '#6366f1', 9: '#14b8a6', 10: '#f43f5e' }
};

const config: Config = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['var(--font-outfit)'],
            },
            colors: {
                background: colorTokens.background,
                surface: colorTokens.surface,
                surfaceElevated: colorTokens.surfaceElevated,
                primary: { ...colorTokens.primary, DEFAULT: colorTokens.primary[500] },
                secondary: { ...colorTokens.secondary, DEFAULT: colorTokens.secondary[500] },
                accent: { ...colorTokens.accent, DEFAULT: colorTokens.accent[500] },
                error: { ...colorTokens.error, DEFAULT: colorTokens.error[500] },
                warning: { ...colorTokens.warning, DEFAULT: colorTokens.warning[500] },
                success: { ...colorTokens.success, DEFAULT: colorTokens.success[500] },
                gray: { ...colorTokens.gray, DEFAULT: colorTokens.gray[800] },
                zinc: { ...colorTokens.zinc, DEFAULT: colorTokens.zinc[800] },

                // Shadcn Semantic Colors - Mapped to Tokens
                border: colorTokens.zinc[700], // zinc-700
                input: colorTokens.zinc[700], // zinc-700
                ring: colorTokens.primary[500],
                foreground: colorTokens.text.primary,
                destructive: {
                    DEFAULT: colorTokens.error[500],
                    foreground: '#ffffff',
                },
                muted: {
                    DEFAULT: colorTokens.zinc[800],
                    foreground: colorTokens.text.muted,
                },
                popover: {
                    DEFAULT: colorTokens.surface,
                    foreground: colorTokens.text.primary,
                },
                card: {
                    DEFAULT: colorTokens.surface,
                    foreground: colorTokens.text.primary,
                },
            },
        },
    },
    plugins: [],
};
export default config;
