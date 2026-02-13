/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#39E079",
          foreground: "#122017",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "#fa5538",
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Custom colors for AutoTest theme with CSS variables
        surface: {
          light: "var(--color-surface-light)",
          dark: "var(--color-surface-dark)",
        },
        sidebar: {
          light: "var(--color-sidebar-light)",
          dark: "var(--color-sidebar-dark)",
        },
        "border-light": "var(--color-border-light)",
        "border-dark": "var(--color-border-dark)",
        "text-muted-light": "var(--color-text-muted-light)",
        "text-muted-dark": "var(--color-text-muted-dark)",
        success: "#39E079",
        warning: "#fbbf24",
        danger: "#fa5538",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        display: ["Inter", "system-ui", "sans-serif"],
      },
      keyframes: {
        fadeInUp: {
          "0%": {
            opacity: "0",
            transform: "translateY(30px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        skeleton: {
          "0%": {
            backgroundColor: "hsl(var(--muted))",
          },
          "50%": {
            backgroundColor: "hsl(var(--muted) / 0.5)",
          },
          "100%": {
            backgroundColor: "hsl(var(--muted))",
          },
        },
        scaleIn: {
          "0%": {
            transform: "scale(0.95)",
          },
          "100%": {
            transform: "scale(1)",
          },
        },
        themeSwitch: {
          "0%": {
            transform: "rotate(0deg) scale(1)",
            opacity: "1",
          },
          "50%": {
            transform: "rotate(180deg) scale(1.2)",
            opacity: "0.8",
          },
          "100%": {
            transform: "rotate(360deg) scale(1)",
            opacity: "1",
          },
        },
        pulseSubtle: {
          "0%, 100%": {
            opacity: "0.2",
          },
          "50%": {
            opacity: "0.3",
          },
        },
      },
      animation: {
        "fade-in-up": "fadeInUp 0.6s ease-out forwards",
        "skeleton-pulse": "skeleton 1.5s ease-in-out infinite",
        "scale-in": "scaleIn 0.2s ease-out",
        "theme-switch": "themeSwitch 0.5s ease-in-out",
        "pulse-subtle": "pulseSubtle 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
