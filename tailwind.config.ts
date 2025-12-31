import type { Config } from "tailwindcss";
import { tailwindColors } from "./lib/colors/tailwind";

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
                // Use centralized color system
                background: tailwindColors.background,
                surface: tailwindColors.surface,
                surfaceElevated: tailwindColors.surfaceElevated,
                primary: tailwindColors.primary,
                secondary: tailwindColors.secondary,
                accent: tailwindColors.accent,
                error: tailwindColors.error,
                warning: tailwindColors.warning,
                success: tailwindColors.success,
                gray: tailwindColors.gray,
                zinc: tailwindColors.zinc,
            },
        },
    },
    plugins: [],
};
export default config;
