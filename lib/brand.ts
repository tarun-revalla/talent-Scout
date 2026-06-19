/**
 * Yext Cobalt design tokens — https://design-system.yext.com/?path=/docs/branding-colors--docs
 * Minimal, fun palette anchored on Cobalt blue.
 */
export const APP_NAME = "Talent Scout";

export const BRAND = {
  name: APP_NAME,
  tagline: "AI-powered talent scouting & engagement",
  assets: {
    /** Primary CDN — preferred in emails & UI */
    yextLogoCdn:
      "https://design-system.yext.com/assets/icons/yext-logo-storybook.svg",
    /** Local fallback (downloaded from CDN) */
    yextLogoLocal: "/yext-logo.svg",
  },
  colors: {
    /** Cobalt — Yext primary */
    primary: "#0047AB",
    primaryHover: "#003A8C",
    primaryLight: "#E8F1FB",
    primaryMuted: "#C5DBF4",
    /** Sky — secondary accent */
    secondary: "#00A5D9",
    secondaryLight: "#E6F7FC",
    /** Amber — tertiary / fun highlight */
    tertiary: "#FFB800",
    tertiaryLight: "#FFF8E6",
    surface: "#F7F9FC",
    border: "#D8E2EF",
    text: "#0A1628",
    textMuted: "#5A6B7D",
    textSubtle: "#8A9BAB",
    white: "#FFFFFF",
  },
} as const;
