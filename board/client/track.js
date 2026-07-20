// board/client/track.js
// Pure race → world mapping. x is progress along the track (centered on 0);
// y is the racer's lane; z is flat. Mirrors orbit.js's role for the orbit scene.
export function trackPosition(completed, total, lane, { length = 16, gap = 1.1 } = {}) {
  const frac = total > 0 ? Math.min(1, completed / total) : 0;
  return { x: frac * length - length / 2, y: lane * gap, z: 0 };
}
