/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/lib/components/ContestListingClient.tsx",
    "./src/lib/components/BlitzRoomClient.tsx",
    "./src/lib/components/ArenaRoomClient.tsx",
    "./src/lib/components/BracketRoomClient.tsx",
    "./src/lib/components/MatchHistoryClient.tsx",
    "./src/lib/components/PostMatchResultClient.tsx",
    "./src/lib/components/CreateBlitzModal.tsx",
    "./src/lib/components/RegisterContestModal.tsx"
  ],
  corePlugins: {
    preflight: false,
  },
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "on-primary-container": "#cbffc2",
        "on-secondary-fixed-variant": "#0c5216",
        "on-primary-fixed-variant": "#005312",
        "error": "#ffb4ab",
        "on-secondary": "#003909",
        "surface-dim": "#131313",
        "on-tertiary-fixed-variant": "#7f2448",
        "surface-container-high": "#2a2a2a",
        "secondary": "#91d78a",
        "primary": "#88d982",
        "tertiary-fixed": "#ffd9e2",
        "inverse-primary": "#1b6d24",
        "inverse-surface": "#e5e2e1",
        "on-tertiary-container": "#ffedf0",
        "secondary-fixed": "#acf4a4",
        "surface-bright": "#393939",
        "primary-container": "#2e7d32",
        "outline": "#8a9485",
        "on-surface-variant": "#bfcaba",
        "on-primary": "#003909",
        "tertiary-fixed-dim": "#ffb1c7",
        "on-error": "#690005",
        "surface-container-lowest": "#0e0e0e",
        "surface-container-highest": "#353534",
        "inverse-on-surface": "#313030",
        "background": "#131313",
        "on-background": "#e5e2e1",
        "on-surface": "#e5e2e1",
        "surface": "#131313",
        "primary-fixed": "#a3f69c",
        "surface-variant": "#353534",
        "tertiary": "#ffb1c7",
        "on-secondary-container": "#84c97d",
        "on-tertiary-fixed": "#3f001c",
        "error-container": "#93000a",
        "on-primary-fixed": "#002204",
        "surface-container": "#201f1f",
        "outline-variant": "#40493d",
        "on-tertiary": "#610931",
        "on-secondary-fixed": "#002203",
        "surface-tint": "#88d982",
        "primary-fixed-dim": "#88d982",
        "tertiary-container": "#b14b6f",
        "surface-container-low": "#1c1b1b",
        "on-error-container": "#ffdad6",
        "secondary-fixed-dim": "#91d78a",
        "secondary-container": "#0f5518"
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      },
      spacing: {
        "margin-desktop": "48px",
        "gutter": "24px",
        "container-max-width": "1200px",
        "unit": "8px",
        "margin-mobile": "16px"
      },
      fontFamily: {
        "body-md": ["Inter"],
        "headline-lg-mobile": ["Hanken Grotesk"],
        "headline-lg": ["Hanken Grotesk"],
        "display-lg": ["Hanken Grotesk"],
        "label-sm": ["JetBrains Mono"]
      },
      fontSize: {
        "body-md": ["16px", { "lineHeight": "1.6", "fontWeight": "400" }],
        "headline-lg-mobile": ["32px", { "lineHeight": "1.2", "fontWeight": "600" }],
        "headline-lg": ["40px", { "lineHeight": "1.2", "letterSpacing": "-0.01em", "fontWeight": "600" }],
        "display-lg": ["56px", { "lineHeight": "1.1", "letterSpacing": "-0.02em", "fontWeight": "700" }],
        "label-sm": ["14px", { "lineHeight": "1.2", "letterSpacing": "0.05em", "fontWeight": "500" }]
      }
    }
  }
};
