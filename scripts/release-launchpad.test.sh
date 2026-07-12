#!/usr/bin/env bash
# Asserts release-launchpad.sh produces the correct branch trees.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
OUT="$(mktemp -d)"; trap 'rm -rf "$OUT"' EXIT
"$ROOT/scripts/release-launchpad.sh" --out "$OUT" >/dev/null

git -C "$OUT" rev-parse --verify main  >/dev/null || { echo "FAIL: no main"; exit 1; }
for b in cicd1 cicd2 cicd3 cicd4; do
  git -C "$OUT" rev-parse --verify "$b" >/dev/null || { echo "FAIL: no $b"; exit 1; }
done

co() { git -C "$OUT" checkout -q "$1"; }
absent() { [ ! -e "$OUT/$1" ] || { echo "FAIL: $2 has $1"; exit 1; }; }
present() { [ -e "$OUT/$1" ] || { echo "FAIL: $2 missing $1"; exit 1; }; }

# main: payload only — no workflow, no board, no monorepo cruft, no dev tests
co main
absent ".github/workflows" main
absent "board" main
absent "pnpm-lock.yaml" main
absent "pnpm-workspace.yaml" main
absent "scripts/__fixtures__" main
present "ship.config.json" main
present "scripts/preflight.mjs" main
present "src/main.js" main
[ -z "$(find "$OUT/src" -name '*.test.mjs')" ] || { echo "FAIL: main ships dev tests"; exit 1; }
grep -q '"test:unit"' "$OUT/package.json" && { echo "FAIL: main keeps test:unit"; exit 1; } || true
grep -qi fork "$OUT/README.md" || { echo "FAIL: main README not the learner one"; exit 1; }

# cicdN: workflow == the Nth end-state; board only at cicd4
for n in 1 2 3 4; do
  co "cicd$n"
  present ".github/workflows/deploy.yml" "cicd$n"
  diff -q "$OUT/.github/workflows/deploy.yml" "$ROOT/starter/workflows/deploy.cicd$n.yml" >/dev/null \
    || { echo "FAIL: cicd$n workflow != deploy.cicd$n.yml"; exit 1; }
done
co cicd1; absent "board" cicd1
co cicd3; absent "board" cicd3
co cicd4; present "board/Dockerfile" cicd4; present "board/src/index.js" cicd4
absent "board/node_modules" cicd4

# ship.config.json frozen == monorepo payload (discipline)
co main
diff -q "$OUT/ship.config.json" "$ROOT/launchpad/ship.config.json" >/dev/null \
  || { echo "FAIL: main ship.config.json drifted from payload"; exit 1; }

echo "OK: release produces correct main + cicd1..4 trees"
