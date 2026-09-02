/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        wa: {
          green: '#25D366',
          dark: '#111B21',
          light: '#202C33',
          chat: '#0B141A',
          bubble: '#005C4B',
          'bubble-in': '#202C33',
          sidebar: '#111B21',
          border: '#2A3942',
          text: '#E9EDEF',
          'text-secondary': '#8696A0',
          header: '#1F2C34',
        },
      },
    },
  },
  plugins: [],
};
