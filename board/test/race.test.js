// board/test/race.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Race } from '../src/race.js';

const prompts = (n) => Array.from({ length: n }, (_, i) => `cmd${i + 1}`);

test('join is idempotent and starts at the line', () => {
  const r = new Race({ total: 3 });
  const a = r.join('octocat');
  assert.deepEqual(a, { completed: 0, finishedAt: null });
  r.join('octocat');
  assert.equal(r.snapshot().ships.length, 1);
});

test('start sets running phase, prompts, and zeroes racers', () => {
  const r = new Race({ total: 3 });
  r.join('octocat');
  r.start(prompts(3));
  assert.equal(r.phase, 'running');
  assert.deepEqual(r.prompts, ['cmd1', 'cmd2', 'cmd3']);
  assert.equal(r.snapshot().ships[0].completed, 0);
});

test('progress advances only on the expected next index', () => {
  const r = new Race({ total: 3 });
  r.join('octocat');
  r.start(prompts(3));
  assert.equal(r.progress('octocat', 1).completed, 1);
  assert.equal(r.progress('octocat', 3).completed, 1); // gap ignored
  assert.equal(r.progress('octocat', 1).completed, 1); // replay ignored
  assert.equal(r.progress('octocat', 2).completed, 2);
});

test('progress is ignored when not running or unknown racer', () => {
  const r = new Race({ total: 3 });
  assert.equal(r.progress('nobody', 1), null);         // idle
  r.join('octocat'); r.start(prompts(3));
  assert.equal(r.progress('ghost', 1), null);          // not joined
});

test('finishing records finish order; all-finished flips phase', () => {
  const r = new Race({ total: 2 });
  r.join('a'); r.join('b'); r.start(prompts(2));
  r.progress('a', 1); r.progress('a', 2);
  assert.equal(r.phase, 'running');                    // b not done
  const a = r.snapshot().ships.find((s) => s.callsign === 'a');
  assert.equal(a.finishedAt, 1);
  r.progress('b', 1); r.progress('b', 2);
  assert.equal(r.phase, 'finished');
  const b = r.snapshot().ships.find((s) => s.callsign === 'b');
  assert.equal(b.finishedAt, 2);
});

test('reset returns to idle and zeroes racers but keeps them joined', () => {
  const r = new Race({ total: 2 });
  r.join('a'); r.start(prompts(2)); r.progress('a', 1);
  r.reset();
  assert.equal(r.phase, 'idle');
  assert.deepEqual(r.prompts, []);
  assert.equal(r.snapshot().ships[0].completed, 0);
});

test('total stays the configured cap across rounds of differing length', () => {
  const r = new Race({ total: 3 });
  r.start(prompts(2));            // fewer than the cap
  assert.equal(r.total, 3);
  r.reset();
  r.start(prompts(5)); // more than the cap
  assert.equal(r.total, 3);
  assert.equal(r.prompts.length, 3);  // clamped to the cap
});
