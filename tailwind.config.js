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
        primary: '#9DA1A8',
        'primary-dark': '#7A7E85',
        success: '#28a745',
        danger: '#dc3545',
        warning: '#ffc107',
        light: '#f8f9fa',
        dark: '#343a40',
        border: '#dee2e6',
      },
    },
  },
  plugins: [],
};
