/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Google Sans"', '"Google Sans Display"', '"DM Sans"', 'system-ui', 'sans-serif'],
        body: ['"Google Sans"', '"Google Sans Text"', '"DM Sans"', 'system-ui', 'sans-serif'],
        deva: ['"Google Sans"', '"Noto Sans Devanagari"', '"DM Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
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
        // Brand primary, now a brighter teal family. Every primary button, chip,
        // link and focus ring derives from these three shades:
        //   DEFAULT - button fill; passes WCAG AA (4.5:1) against white text
        //   dark    - hover / pressed fill, and text on light-teal tints
        //   light   - bright accent shade for tints and non-text highlights
        pine: { DEFAULT: '#0D8074', dark: '#0A6459', light: '#2DD4BF' },
        flag: '#C42E2E',
        gold: '#F0B90B',
        mist: '#EEF2ED',
        ink: { DEFAULT: '#14201A', soft: '#4B5C55' },
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
