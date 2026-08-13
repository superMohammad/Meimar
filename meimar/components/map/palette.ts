/**
 * Colours the map draws with.
 *
 * Kept apart from `layers.ts` because that module imports Leaflet, which
 * touches `window` at module scope. The legend needs these values and renders
 * during prerendering, so importing them from `layers.ts` would drag Leaflet
 * into the server build and fail the page.
 *
 * These are not the brand palette. Map overlays are tuned for contrast against
 * satellite imagery — Saudi aerial ground is warm sand, so a sand-toned overlay
 * disappears into it. The brand palette owns the chrome instead.
 */

export const PALETTE = {
  sand50: "#ede0d4",
  sand100: "#e6ccb2",
  sand200: "#ddb892",
  sand400: "#b08968",
  sand700: "#7f5539",
  /** Saturated magenta: does not occur on the ground, so pins stay findable. */
  pinFill: "#d6206e",
  pinRing: "#ffffff",
  pinSelected: "#ffe98a",
} as const;

/**
 * Choropleth steps, light to dark: cheap is pale, expensive is deep.
 *
 * Lightness carries the value, which is the only encoding a reader interprets
 * without consulting a legend -- and it runs the way people already expect,
 * "more expensive" reading as "heavier". An earlier ramp ran dark-indigo to
 * bright-yellow, which is a perfectly good sequential scale and exactly
 * backwards: the cheapest districts were the darkest thing on the map.
 *
 * The hue is a cool neutral rather than the brand sand. Saudi aerial ground is
 * warm tan, so every warm step sits on top of its own colour and the two
 * lightest ones vanish; a cool ramp separates from the imagery by hue even
 * where it matches it in lightness. Brand identity stays in the chrome.
 *
 * Relative luminance runs 0.87 / 0.63 / 0.28 / 0.11 / 0.03 -- monotonic, with
 * no two adjacent steps close enough to be confused.
 *
 * Five discrete steps rather than a continuous gradient: a reader can match a
 * shape to a legend entry but not to a smooth ramp.
 */
export const CHOROPLETH_STEPS = [
  "#f2f4f7",
  "#c8d0da",
  "#8f9db1",
  "#55647c",
  "#26334a",
] as const;

/**
 * Districts with an outline but no figure for the selected type and purpose.
 *
 * Drawn, not hidden. Omitting them entirely -- the earlier behaviour -- left
 * holes that read as a rendering fault, and left the reader unable to tell "no
 * listings of this type here" from "not part of the layer". A transparent fill
 * under a dashed stroke says the district exists and has nothing to report,
 * which is different from being cheap.
 */
export const CHOROPLETH_NO_DATA = "#8f9db1" as const;
