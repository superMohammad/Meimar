import localFont from "next/font/local";

/**
 * Thmanyah typeface, self-hosted from `Assets/Thmanyah-Font-Family.zip`.
 *
 * Sans carries the interface, serif display carries headings. Both cover Arabic
 * and Latin, so a locale switch does not change typeface — only direction.
 */

export const thmanyahSans = localFont({
  src: [
    { path: "../public/fonts/thmanyahsans-Light.woff2", weight: "300", style: "normal" },
    { path: "../public/fonts/thmanyahsans-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/thmanyahsans-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/thmanyahsans-Bold.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/thmanyahsans-Black.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

export const thmanyahDisplay = localFont({
  src: [
    { path: "../public/fonts/thmanyahserifdisplay-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/thmanyahserifdisplay-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/thmanyahserifdisplay-Bold.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/thmanyahserifdisplay-Black.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
});
