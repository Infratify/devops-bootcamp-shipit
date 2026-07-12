// board/client/launch.js
// Pure launch-beat timing. No `three`, no DOM — scene.js applies these numbers
// to meshes. Phases: charge (anticipation) → thrust (ascent) → arc (into orbit).
import { LAUNCH } from './theme.js';

const { CHARGE_MS, THRUST_MS, ARC_MS } = LAUNCH;
export const LAUNCH_TOTAL_MS = CHARGE_MS + THRUST_MS + ARC_MS;

export function launchPhase(elapsedMs) {
  if (elapsedMs < CHARGE_MS) return { phase: 'charge', f: elapsedMs / CHARGE_MS };
  if (elapsedMs < CHARGE_MS + THRUST_MS) return { phase: 'thrust', f: (elapsedMs - CHARGE_MS) / THRUST_MS };
  if (elapsedMs < LAUNCH_TOTAL_MS) return { phase: 'arc', f: (elapsedMs - CHARGE_MS - THRUST_MS) / ARC_MS };
  return { phase: 'done', f: 1 };
}

export function isComplete(elapsedMs) { return elapsedMs >= LAUNCH_TOTAL_MS; }

export function easeInCubic(t) { return t * t * t; }
export function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
