import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typedState } from './typing.js';

test('matched counts the correct leading prefix', () => {
  assert.deepEqual(typedState('git status', 'git s'), { matched: 5, done: false });
  assert.deepEqual(typedState('git status', 'git x'), { matched: 4, done: false });
  assert.deepEqual(typedState('git status', ''), { matched: 0, done: false });
});

test('done is true only on an exact full match', () => {
  assert.deepEqual(typedState('ls -l', 'ls -l'), { matched: 5, done: true });
  assert.deepEqual(typedState('ls -l', 'ls -l '), { matched: 5, done: false }); // trailing extra
});
