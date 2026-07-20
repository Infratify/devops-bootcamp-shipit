import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORPUS, SESSIONS, pool, pickPrompts } from '../src/corpus.js';

test('pool flattens the unlocked tools for a session', () => {
  const p = pool('cicd3');
  assert.ok(p.includes('git status'));
  assert.ok(p.includes('docker build -t app .'));
  assert.equal(p.length, SESSIONS.cicd3.reduce((n, k) => n + CORPUS[k].length, 0));
});

test('pool is empty for an unknown session', () => {
  assert.deepEqual(pool('nope'), []);
});

test('pickPrompts returns n distinct commands from the pool', () => {
  const picks = pickPrompts('cicd3', 12);
  assert.equal(picks.length, 12);
  assert.equal(new Set(picks).size, 12);
  const p = pool('cicd3');
  for (const cmd of picks) assert.ok(p.includes(cmd));
});

test('pickPrompts is deterministic given a rand stub', () => {
  const first = () => 0;
  const a = pickPrompts('cicd3', 5, first);
  const b = pickPrompts('cicd3', 5, first);
  assert.deepEqual(a, b);
});

test('pickPrompts caps at pool size', () => {
  const picks = pickPrompts('cicd3', 99999);
  assert.equal(picks.length, pool('cicd3').length);
});
