/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#7B6CA8',
          dark: '#5E5090',
          light: '#EBE6F4',
        },
        cream: '#F7EFE4',
      },
      fontFamily: {
        serif: ["'EB Garamond'", 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
