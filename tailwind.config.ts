import type { Config } from "tailwindcss";

/** Yext Cobalt palette — https://design-system.yext.com/?path=/docs/branding-colors--docs */
const cobalt = {
  50: "#E8F1FB",
  100: "#C5DBF4",
  200: "#9BBCE8",
  300: "#6A9ADB",
  400: "#3D79CE",
  500: "#1A5FBF",
  600: "#0047AB",
  700: "#003A8C",
  800: "#002E6E",
  900: "#002152",
};

const sky = {
  50: "#E6F7FC",
  100: "#B3E8F7",
  200: "#80D9F2",
  300: "#4DC9ED",
  400: "#26BDE8",
  500: "#00A5D9",
  600: "#0088B3",
  700: "#006A8C",
};

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cobalt,
        sky,
        brand: cobalt,
        "surface-subtle": "#F4F7FB",
      },
      maxWidth: {
        content: "90rem",
      },
      boxShadow: {
        card: "0 1px 2px rgb(15 23 42 / 0.04), 0 4px 16px rgb(15 23 42 / 0.04)",
        "card-hover":
          "0 4px 8px rgb(15 23 42 / 0.06), 0 12px 32px rgb(15 23 42 / 0.08)",
        glow: "0 0 0 1px rgb(0 71 171 / 0.08), 0 8px 24px rgb(0 71 171 / 0.12)",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      animation: {
        "page-enter": "pageEnter 360ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        pageEnter: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
