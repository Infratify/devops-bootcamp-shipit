#!/usr/bin/env bash
# release-launchpad.sh — assemble the forkable Infratify/shipit-launchpad repo from this monorepo.
#
#   main            payload only (ship + config + preflight)  — NO workflow, NO board/
#   cicd1..4        answer keys; each = main + that session's deploy.yml (board/ enters at cicd4)
#
# Usage:  release-launchpad.sh [--out DIR] [--push REMOTE]
#   --out DIR     where to build the repo (default: <monorepo>/.launchpad-release)
#   --push REMOTE after building, force-push main + cicd1..4 to REMOTE (a git URL)
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
OUT="$ROOT/.launchpad-release"
PUSH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --out)  OUT="$2"; shift 2 ;;
    --push) PUSH="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

WF="$ROOT/starter/workflows"
for n in 1 2 3 4; do [ -f "$WF/deploy.cicd$n.yml" ] || { echo "missing $WF/deploy.cicd$n.yml" >&2; exit 1; }; done
[ -f "$ROOT/starter/README.learner.md" ] || { echo "missing starter/README.learner.md" >&2; exit 1; }

# --- stage the payload-only main tree ---
# Uses tar (universally present; no rsync dependency for a tool instructors/CI will run).
# Copy the ship payload skipping the heavy build dirs, then strip dev/monorepo cruft precisely.
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
tar -C "$ROOT/launchpad" --exclude='./node_modules' --exclude='./dist' -cf - . | tar -C "$STAGE" -xf -
rm -f "$STAGE/pnpm-lock.yaml" "$STAGE/pnpm-workspace.yaml"
find "$STAGE" -name '*.test.mjs' -delete
find "$STAGE" -type d -name '__fixtures__' -prune -exec rm -rf {} +
cp "$ROOT/starter/README.learner.md" "$STAGE/README.md"
# drop the dev-only test:unit script from package.json (Node, no jq dependency)
node -e 'const fs=require("fs"),f=process.argv[1],p=JSON.parse(fs.readFileSync(f));delete p.scripts["test:unit"];fs.writeFileSync(f,JSON.stringify(p,null,2)+"\n")' "$STAGE/package.json"

# --- build the git repo ---
rm -rf "$OUT"; mkdir -p "$OUT"
git -C "$OUT" init -q
git -C "$OUT" config user.email "bootcamp@infratify.dev"
git -C "$OUT" config user.name  "Ship It release"

commit_tree() { git -C "$OUT" add -A && git -C "$OUT" commit -q -m "$1"; }
sync_into()   { tar -C "$1" -cf - . | tar -C "$OUT" -xf -; }   # copy tree contents into OUT, keeping .git

# main
git -C "$OUT" checkout -q -b main
sync_into "$STAGE/"
commit_tree "shipit-launchpad: ship payload — fork & build on this (no workflow, no board/)"

# cicd1..3: layer the workflow as .github/workflows/deploy.yml
prev=main
for n in 1 2 3; do
  git -C "$OUT" checkout -q -b "cicd$n" "$prev"
  mkdir -p "$OUT/.github/workflows"
  cp "$WF/deploy.cicd$n.yml" "$OUT/.github/workflows/deploy.yml"
  commit_tree "cicd$n: session $n answer key"
  prev="cicd$n"
done

# cicd4: workflow + the board/ payload (the black box they build)
git -C "$OUT" checkout -q -b cicd4 cicd3
cp "$WF/deploy.cicd4.yml" "$OUT/.github/workflows/deploy.yml"
mkdir -p "$OUT/board"
tar -C "$ROOT/board" --exclude='./node_modules' --exclude='./dist' -cf - . | tar -C "$OUT/board" -xf -
commit_tree "cicd4: session 4 answer key + board/ (build & ship it)"

git -C "$OUT" checkout -q main

echo "built: main cicd1 cicd2 cicd3 cicd4  ->  $OUT"

if [ -n "$PUSH" ]; then
  echo "pushing to $PUSH ..."
  git -C "$OUT" push --force "$PUSH" main cicd1 cicd2 cicd3 cicd4
  echo "pushed."
fi
