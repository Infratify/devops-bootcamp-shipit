import './style.css';
import { createScene } from './scene.js';
import { createFallback, detectWebGL, shouldUseFallback } from './fallback.js';

const app = document.getElementById('app');
const count = document.getElementById('count');
const toasts = document.getElementById('toasts');
const gl = detectWebGL();
const mql = window.matchMedia('(prefers-reduced-motion: reduce)');

let lastShips = [];
let view = makeView(shouldUseFallback({ gl, reducedMotion: mql.matches }));

function showLiftoff(callsign) {
  if (!toasts) return;
  // Cap the stack so a class-end launch burst can't run toasts off-screen over the scene.
  while (toasts.children.length >= 5) toasts.firstChild.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = `LIFTOFF ✦ @${callsign}`;
  toasts.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3000);
}

function makeView(useFallback) {
  const v = useFallback ? createFallback(app) : createScene(app, {
    onLiftoff: showLiftoff,
    onPreloadError: () => {
      view.dispose();
      view = createFallback(app);
      view.update(lastShips);
    },
  });
  v.update(lastShips);
  return v;
}

mql.addEventListener('change', (e) => {
  view.dispose();
  view = makeView(shouldUseFallback({ gl, reducedMotion: e.matches }));
});
window.addEventListener('pagehide', () => view.dispose());

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'roster' && Array.isArray(m.ships)) {
      lastShips = m.ships;
      view.update(lastShips);
      if (count) count.textContent = `${lastShips.length} ship${lastShips.length === 1 ? '' : 's'}`;
    }
  };
  ws.onclose = () => setTimeout(connect, 1000);
  ws.onerror = () => ws.close();
}
connect();
