import type { Config } from "tailwindcss";

export default {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['var(--font-geist-sans)'],
                mono: ['var(--font-geist-mono)'],
            },
            animation: {
                enter: 'enter 150ms ease-out',
                leave: 'leave 100ms ease-in forwards',
                "fade-in": 'fade-in 150ms ease-out',
                "fade-out": 'fade-out 100ms ease-in forwards',
            },
            keyframes: {
                enter: {
                    '0%': { transform: 'scale(0.9)', opacity: "0" },
                    '100%': { transform: 'scale(1)', opacity: "1" },
                },
                leave: {
                    '0%': { transform: 'scale(1)', opacity: "1" },
                    '100%': { transform: 'scale(0.9)', opacity: "0" },
                },
                "fade-in": {
                    '0%': { opacity: "0" },
                    '100%': { opacity: "1" },
                },
                "fade-out": {
                    '0%': { opacity: "1" },
                    '100%': { opacity: "0" },
                },
            },
        },
    },
    plugins: [],
} satisfies Config;
