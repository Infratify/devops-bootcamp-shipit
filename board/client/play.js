import './play.css';
import { typedState } from './typing.js';

const params = new URLSearchParams(location.search);
const callsign = (params.get('callsign') || '').toLowerCase();
const statusEl = document.getElementById('status');
const promptEl = document.getElementById('prompt');
const entry = document.getElementById('entry');
const me = document.getElementById('me');

let prompts = [];
let phase = 'idle';
let completed = 0; // my confirmed position
let synced = false; // becomes true once we've trusted the server's position after (re)connect
let prevPhase = 'idle';

function render() {
  const target = prompts[completed] || '';
  promptEl.textContent = target;
  if (phase === 'running' && completed < prompts.length) {
    const { matched } = typedState(target, entry.value);
    promptEl.dataset.matched = String(matched);
    me.style.left = `${(completed / Math.max(1, prompts.length)) * 100}%`;
    entry.disabled = false;
  } else {
    entry.disabled = true;
  }
  statusEl.textContent =
    phase === 'running' ? `RACING — ${completed}/${prompts.length}`
    : phase === 'finished' ? 'FINISHED ✦'
    : 'waiting for race…';
}

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => { synced = false; statusEl.textContent = 'joining…'; ws.send(JSON.stringify({ t: 'join', callsign })); };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'denied') { statusEl.textContent = 'Ship not found — run your pipeline first.'; entry.disabled = true; return; }
    if (m.t === 'race') {
      prompts = m.prompts || [];
      phase = m.phase;
      const mine = (m.ships || []).find((s) => s.callsign === callsign);
      const serverCompleted = mine ? mine.completed : 0;
      if (!synced) { completed = serverCompleted; synced = true; }             // (re)connect/reload: trust the server's position
      else if (m.phase === 'running' && prevPhase !== 'running') completed = serverCompleted; // a new round just started (server reset us to 0)
      // during a running round, keep the local optimistic `completed`; the server is authoritative and silently rejects bad progress
      prevPhase = m.phase;
      render();
    }
  };
  entry.oninput = () => {
    const target = prompts[completed] || '';
    const { matched, done } = typedState(target, entry.value);
    promptEl.dataset.matched = String(matched);
    if (done && phase === 'running') {
      completed += 1;
      entry.value = '';
      ws.send(JSON.stringify({ t: 'progress', completed }));
      render();
    }
  };
  ws.onclose = () => { statusEl.textContent = 'disconnected — reconnecting…'; setTimeout(connect, 1000); };
  ws.onerror = () => ws.close();
}

if (!callsign) { statusEl.textContent = 'No callsign — open this from your ship’s READY button.'; entry.disabled = true; }
else connect();
