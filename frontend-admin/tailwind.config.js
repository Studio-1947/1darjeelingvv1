/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Google Sans"', '"Google Sans Display"', '"DM Sans"', 'system-ui', 'sans-serif'],
        body: ['"Google Sans"', '"Google Sans Text"', '"DM Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        pine: { DEFAULT: '#2C5E3B', dark: '#1F4429', light: '#4E8261' },
        flag: '#C42E2E',
        gold: '#F0B90B',
        mist: '#EEF2ED',
        ink: { DEFAULT: '#14201A', soft: '#4B5C55' },
      },
    },
  },
  plugins: [],
}
