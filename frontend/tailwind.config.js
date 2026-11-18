/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      // One stack: the --font token in styles/aangan.css (Google Sans Flex, Noto Sans for Indic scripts).
      fontFamily: {
        display: ['var(--font)'],
        body: ['var(--font)'],
        sans: ['var(--font)'],
        deva: ['var(--font)'],
      },
      // /7 sets every heavy label at medium: nothing above 500.
      fontWeight: { semibold: '500', bold: '500', extrabold: '500', black: '500' },
      borderRadius: {
        '2xl': 'var(--r-card)',
        '3xl': 'var(--r-card)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        // Legacy names on the theme palette (styles/aangan.css; re-tinted by lib/theme.ts). pine = the brand colour.
        pine: { DEFAULT: 'rgb(var(--r-rgb) / <alpha-value>)', dark: 'rgb(var(--r-press-rgb) / <alpha-value>)', light: 'rgb(var(--r-tint-rgb) / <alpha-value>)' },
        flag: 'rgb(217 45 32 / <alpha-value>)',
        gold: 'rgb(245 180 0 / <alpha-value>)',
        mist: 'rgb(var(--creme2-rgb) / <alpha-value>)',
        ink: { DEFAULT: 'rgb(var(--ink-strong-rgb) / <alpha-value>)', soft: 'rgb(var(--ink-muted-rgb) / <alpha-value>)' },
        creme: 'rgb(var(--creme-rgb) / <alpha-value>)',
        blush: 'rgb(var(--blush-rgb) / <alpha-value>)',
      },
      keyframes: {
        'fade-up': { from: { opacity: 0, transform: 'translateY(16px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
      animation: {
        'fade-up': 'fade-up 0.6s ease-out both',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
