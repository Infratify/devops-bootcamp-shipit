// board/client/race-fallback.js
// Static (no requestAnimationFrame, reduced-motion-safe) DOM leaderboard for
// the race view — mirrors fallback.js's role for the orbit scene, so a
// no-WebGL / reduced-motion projector still shows race progress.
const ROUND_SIZE = 12; // pinned round size, same simplification race-view.js uses

// Same interface as createRaceView: { update(ships), dispose() }.
export function createRaceFallback(container) {
  const el = document.createElement('div');
  el.className = 'race-fallback';
  container.append(el);

  return {
    update(ships) {
      const sorted = [...ships].sort((a, b) => {
        const d = (b.completed || 0) - (a.completed || 0);
        if (d !== 0) return d;
        return a.callsign < b.callsign ? -1 : a.callsign > b.callsign ? 1 : 0;
      });

      el.innerHTML = '';
      for (const s of sorted) {
        const completed = s.completed || 0;
        const row = document.createElement('div');
        row.className = 'row';

        const cs = document.createElement('span');
        cs.className = 'cs';
        cs.textContent = `@${s.callsign}`;
        row.append(cs);

        const track = document.createElement('span');
        track.className = 'track';
        const fill = document.createElement('span');
        fill.className = 'fill';
        fill.style.width = `${Math.min(100, (completed / ROUND_SIZE) * 100)}%`;
        track.append(fill);
        row.append(track);

        const n = document.createElement('span');
        n.className = 'n';
        n.textContent = String(completed);
        row.append(n);

        el.append(row);
      }
    },
    dispose() { el.remove(); },
  };
}
