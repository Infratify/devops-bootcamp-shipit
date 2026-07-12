#!/usr/bin/env bash
# verify-fork-sync.sh — prove the load-bearing discipline: a learner fork syncs upstream `main`
# with ZERO conflicts, because upstream main never gains a workflow and never re-touches
# ship.config.json. Local git only — merge mechanics are identical to a GitHub fork.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT

# 1. Build the upstream repo (main + cicd1..4)
"$ROOT/scripts/release-launchpad.sh" --out "$W/upstream" >/dev/null
UP="$W/upstream"

# 2. Structural invariants on upstream main
git -C "$UP" checkout -q main
[ ! -e "$UP/.github/workflows" ] || { echo "FAIL: upstream main carries a workflow"; exit 1; }
[ ! -e "$UP/board" ]            || { echo "FAIL: upstream main carries board/"; exit 1; }
diff -q "$UP/ship.config.json" "$ROOT/launchpad/ship.config.json" >/dev/null \
  || { echo "FAIL: upstream main ship.config.json drifted from the frozen payload"; exit 1; }

# 3. Clone main as a learner fork
git clone -q --branch main "$UP" "$W/fork"
FORK="$W/fork"
git -C "$FORK" config user.email learner@example.com
git -C "$FORK" config user.name  "Learner One"
git -C "$FORK" remote add upstream "$UP"

# 4. Learner customizes: edit ship.config.json + author their own deploy.yml (the S1 file)
node -e 'const fs=require("fs"),f=process.argv[1],c=JSON.parse(fs.readFileSync(f));c.shipName="Learner One";c.color="#ff8800";fs.writeFileSync(f,JSON.stringify(c,null,2)+"\n")' "$FORK/ship.config.json"
mkdir -p "$FORK/.github/workflows"
cp "$ROOT/starter/workflows/deploy.cicd1.yml" "$FORK/.github/workflows/deploy.yml"
git -C "$FORK" add -A
git -C "$FORK" commit -q -m "my ship + my pipeline"

# 5. Instructor fix on upstream main — touches src/ ONLY (never config, never a workflow)
git -C "$UP" checkout -q main
printf '\n// instructor: tiny scene tweak\n' >> "$UP/src/main.js"
git -C "$UP" add -A
git -C "$UP" commit -q -m "instructor: tweak scene"

# 6. Learner syncs upstream main — MUST be conflict-free
git -C "$FORK" fetch -q upstream main
if ! git -C "$FORK" merge --no-edit upstream/main >/dev/null 2>&1; then
  echo "FAIL: sync produced a conflict:"; git -C "$FORK" status --short
  exit 1
fi

# 7. Both the learner's changes and the instructor fix survived
grep -q "Learner One" "$FORK/ship.config.json"       || { echo "FAIL: learner config lost"; exit 1; }
grep -q "instructor: tiny scene tweak" "$FORK/src/main.js" || { echo "FAIL: instructor fix not merged"; exit 1; }
[ -f "$FORK/.github/workflows/deploy.yml" ]          || { echo "FAIL: learner workflow lost"; exit 1; }

echo "PASS: fresh fork synced an instructor fix with 0 conflicts (discipline holds)"
