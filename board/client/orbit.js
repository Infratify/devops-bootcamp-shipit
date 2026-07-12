// Pure even-spacing for the shared orbit. `index` is the ship's position AMONG
// ORBITING ships (not the full roster) — that is the M2 clumping fix. No `three`.

export function orbitAngle(index, count, baseAngle = 0) {
  if (count <= 0) return baseAngle;
  return baseAngle + (index / count) * Math.PI * 2;
}
