import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orbitAngle } from './orbit.js';

const TAU = Math.PI * 2;

test('spaces N ships evenly around the ring', () => {
  const count = 4;
  const angles = [0, 1, 2, 3].map((i) => orbitAngle(i, count, 0));
  assert.deepEqual(angles, [0, TAU / 4, TAU / 2, (3 * TAU) / 4]);
  // every adjacent gap is exactly 2π/N
  for (let i = 1; i < count; i++) {
    assert.ok(Math.abs((angles[i] - angles[i - 1]) - TAU / count) < 1e-9);
  }
});

test('applies the base-angle offset (global rotation)', () => {
  assert.ok(Math.abs(orbitAngle(1, 4, 0.5) - (0.5 + TAU / 4)) < 1e-9);
});

test('single ship sits at the base angle', () => {
  assert.equal(orbitAngle(0, 1, 0.7), 0.7);
});

test('zero orbiting ships does not divide by zero', () => {
  assert.equal(orbitAngle(0, 0, 0.7), 0.7);
});
