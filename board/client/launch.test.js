import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchPhase, isComplete, LAUNCH_TOTAL_MS, easeInCubic, easeInOutCubic } from './launch.js';
import { LAUNCH } from './theme.js';

test('total duration is the sum of the three phases', () => {
  assert.equal(LAUNCH_TOTAL_MS, LAUNCH.CHARGE_MS + LAUNCH.THRUST_MS + LAUNCH.ARC_MS);
});

test('maps elapsed time to the right phase', () => {
  assert.equal(launchPhase(0).phase, 'charge');
  assert.equal(launchPhase(LAUNCH.CHARGE_MS).phase, 'thrust');
  assert.equal(launchPhase(LAUNCH.CHARGE_MS + LAUNCH.THRUST_MS).phase, 'arc');
  assert.equal(launchPhase(LAUNCH_TOTAL_MS).phase, 'done');
  assert.equal(launchPhase(LAUNCH_TOTAL_MS + 500).phase, 'done');
});

test('phase fraction f stays within [0,1]', () => {
  for (const ms of [0, 300, LAUNCH.CHARGE_MS + 10, LAUNCH_TOTAL_MS - 1]) {
    const { f } = launchPhase(ms);
    assert.ok(f >= 0 && f <= 1, `f=${f} out of range at ${ms}ms`);
  }
});

test('isComplete flips at total duration', () => {
  assert.equal(isComplete(LAUNCH_TOTAL_MS - 1), false);
  assert.equal(isComplete(LAUNCH_TOTAL_MS), true);
});

test('easings hit the endpoints and are monotonic', () => {
  for (const ease of [easeInCubic, easeInOutCubic]) {
    assert.ok(Math.abs(ease(0)) < 1e-9);
    assert.ok(Math.abs(ease(1) - 1) < 1e-9);
    assert.ok(ease(0.25) < ease(0.75));
  }
});
