/**
 * Photography used across the landing page.
 * Served from the Pexels CDN (free licence, no attribution required) so the
 * single-file build never depends on binary assets in the repo.
 * Swap any URL for a local import (e.g. `import x from "../assets/x.jpg"`) at any time.
 */
const pexels = (id: number, w: number, h?: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}${
    h ? `&h=${h}&fit=crop` : ""
  }`;

export const IMAGES = {
  /** Hero background: Lagos market with colourful umbrellas and the skyline behind */
  heroMarket: pexels(16155219, 1800),
  /** Footer background: crowded market street under branded umbrellas */
  footerMarket: pexels(16114746, 1600),
  /** Small "customer snapshot" of stacked grain sacks (Kaduna market) used in chat mockups */
  chatSacks: pexels(38830144, 640, 420),
} as const;
