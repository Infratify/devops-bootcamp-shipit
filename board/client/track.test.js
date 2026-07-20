import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackPosition } from './track.js';

test('x runs left→right with progress, centered on the track', () => {
  const start = trackPosition(0, 12, 0, { length: 12 });
  const end = trackPosition(12, 12, 0, { length: 12 });
  assert.equal(start.x, -6);
  assert.equal(end.x, 6);
});

test('lane sets the vertical slot; z is flat', () => {
  const lane0 = trackPosition(0, 12, 0, { gap: 1 });
  const lane2 = trackPosition(0, 12, 2, { gap: 1 });
  assert.equal(lane2.y - lane0.y, 2);
  assert.equal(lane0.z, 0);
});

test('total of 0 does not divide by zero', () => {
  const p = trackPosition(0, 0, 0, { length: 12 });
  assert.equal(Number.isFinite(p.x), true);
});
