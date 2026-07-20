// board/src/race.js
// The in-memory, authoritative race. Pure and node-testable, like room.js.
// The server owns positions + phase; cockpits only report their next completion.
export class Race {
  constructor({ total = 12 } = {}) {
    this.total = total;
    this.phase = 'idle';        // idle | running | finished
    this.prompts = [];          // identical ordered command list for every racer
    this.racers = new Map();    // callsign -> { completed, finishedAt }
    this._seq = 0;              // monotonic finish-order counter
  }

  join(callsign) {
    if (!this.racers.has(callsign)) this.racers.set(callsign, { completed: 0, finishedAt: null });
    return this.racers.get(callsign);
  }

  start(prompts) {
    this.prompts = prompts.slice(0, this.total);
    this.phase = 'running';
    this._seq = 0;
    for (const r of this.racers.values()) { r.completed = 0; r.finishedAt = null; }
    return this;
  }

  progress(callsign, completed) {
    if (this.phase !== 'running') return null;
    const r = this.racers.get(callsign);
    if (!r) return null;
    if (completed !== r.completed + 1 || completed > this.total) return r; // out-of-order/replay
    r.completed = completed;
    if (r.completed >= this.total && r.finishedAt == null) r.finishedAt = ++this._seq;
    if (this._allFinished()) this.phase = 'finished';
    return r;
  }

  reset() {
    this.phase = 'idle';
    this.prompts = [];
    for (const r of this.racers.values()) { r.completed = 0; r.finishedAt = null; }
  }

  snapshot() {
    const ships = [...this.racers.entries()].map(([callsign, r]) => ({
      callsign, completed: r.completed, finishedAt: r.finishedAt,
    }));
    return { phase: this.phase, total: this.total, prompts: this.prompts, ships };
  }

  _allFinished() {
    if (this.racers.size === 0) return false;
    for (const r of this.racers.values()) if (r.finishedAt == null) return false;
    return true;
  }
}
