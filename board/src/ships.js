// Board copy of the launchpad ship registry + hue math. Keep byte-identical to
// launchpad/src/ship-schema.js's SHIPS / SHIP_IDS / DEFAULT_SHIP / hueOf.
export const SHIPS = [
  { id: 'fighter',     file: 'fighter.glb',     label: 'Fighter' },
  { id: 'interceptor', file: 'interceptor.glb', label: 'Interceptor' },
  { id: 'hauler',      file: 'hauler.glb',      label: 'Hauler' },
  { id: 'scout',       file: 'scout.glb',       label: 'Scout' },
];
export const SHIP_IDS = SHIPS.map((s) => s.id);
export const DEFAULT_SHIP = 'fighter';

// The hue of `color` as a fraction of the colour wheel [0, 1), which the ship
// shader sets on every saturated texel. Returns null for a (near-)greyscale or
// invalid colour, which leaves the baked paint untouched (greys stay grey).
export function hueOf(color) {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(typeof color === 'string' ? color : '');
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (sat < 0.15) return null;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h / 360;
}
