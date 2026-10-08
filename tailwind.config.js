/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: '#1A6B52',
          deep: '#123D30',
          light: '#E4F3EA',
        },
        ink: '#183129',
        muted: '#718078',
      },
    },
  },
  plugins: [],
}
