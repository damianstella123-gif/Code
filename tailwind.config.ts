import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        foreground: '#fafafa',
        card: '#141414',
        cardForeground: '#fafafa',
        popover: '#1a1a1a',
        popoverForeground: '#fafafa',
        primary: '#dc2626',
        primaryForeground: '#ffffff',
        secondary: '#262626',
        secondaryForeground: '#fafafa',
        muted: '#262626',
        mutedForeground: '#a3a3a3',
        accent: '#dc2626',
        accentForeground: '#ffffff',
        destructive: '#dc2626',
        destructiveForeground: '#ffffff',
        border: '#262626',
        input: '#262626',
        ring: '#dc2626',
      },
    },
  },
  plugins: [],
}
export default config
