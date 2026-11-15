// The look plan, in one place. Foundry Yard at dusk: slate and teal steel, warm amber
// accent light, rust-red Wardens against it. The same names are the CSS custom
// properties in index.html, so HUD and scene never drift apart.
export const PALETTE = {
  canvas: '#17130f',
  surface: '#232a2e',
  hairline: '#39434a',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
  teal: '#2f6f6a',
  rust: '#a33d2a',
  ember: '#ff7a2f',
  sand: '#c8a06a',
  dusk: '#2b3a55',
  dark: '#10151a',
};

export function shade(name) {
  return PALETTE[name];
}
