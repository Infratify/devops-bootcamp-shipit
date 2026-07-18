// Pure keystroke evaluation for the cockpit. `matched` drives per-character
// colouring; `done` fires the progress report. Correctness is judged client-side
// (the server stays authoritative over position — see the spec's security note).
export function typedState(target, input) {
  let matched = 0;
  while (matched < input.length && matched < target.length && input[matched] === target[matched]) matched++;
  return { matched, done: input === target };
}
