/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      // Alle Farben kommen aus CSS-Variablen (src/styles/main.css), die im
      // Dark Mode einmal zentral umgeschaltet werden. Dadurch braucht keine
      // einzelne Klasse eine dark:-Variante — genau da entstehen sonst die Lücken.
      colors: {
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        surface2: 'rgb(var(--c-surface2) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-soft': 'rgb(var(--c-accent-soft) / <alpha-value>)',
        'accent-ink': 'rgb(var(--c-accent-ink) / <alpha-value>)',
        star: 'rgb(var(--c-star) / <alpha-value>)',
        unread: 'rgb(var(--c-unread) / <alpha-value>)',
        reading: 'rgb(var(--c-reading) / <alpha-value>)',
        read: 'rgb(var(--c-read) / <alpha-value>)',
        overdue: 'rgb(var(--c-overdue) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        title: ['Georgia', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
};
