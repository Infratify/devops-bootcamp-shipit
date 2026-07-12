#!/usr/bin/env bash
# verify-workflows.sh — structural + contract checks on the four answer-key workflows.
# Not a CI gate; a fail-loud sanity check the release relies on. Runs actionlint if present.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
WF="$ROOT/starter/workflows"

fail() { echo "FAIL: $1" >&2; exit 1; }
# has() checks existence first so a not-yet-created file gives a clean "missing" message.
has()  { [ -f "$1" ] || fail "missing $1"; grep -Fq "$2" "$1" || fail "$(basename "$1"): missing '$2'"; }

# YAML-validity / actionlint over whatever answer keys exist at this stage (glob, not a fixed 1..4
# list) — so this same script is correct at Task 2 (cicd1..2 present) and Task 3 (cicd1..4 present).
for f in "$WF"/deploy.cicd*.yml; do
  [ -e "$f" ] || continue
  if command -v python3 >/dev/null 2>&1 && python3 -c 'import yaml' 2>/dev/null; then
    python3 -c "import yaml,sys; yaml.safe_load(open('$f'))" || fail "$(basename "$f"): invalid YAML"
  fi
  if command -v actionlint >/dev/null 2>&1; then
    actionlint "$f" || fail "$(basename "$f"): actionlint"
  fi
done

# cicd1 — Pages deploy on push, callsign injected
has "$WF/deploy.cicd1.yml" "branches: [main]"
has "$WF/deploy.cicd1.yml" "VITE_CALLSIGN: \${{ github.actor }}"
has "$WF/deploy.cicd1.yml" "actions/deploy-pages@v4"
has "$WF/deploy.cicd1.yml" "path: dist"

# cicd2 — adds the pre-flight test gate that blocks deploy
has "$WF/deploy.cicd2.yml" "npm test"
has "$WF/deploy.cicd2.yml" "needs: test"
has "$WF/deploy.cicd2.yml" "VITE_CALLSIGN: \${{ github.actor }}"

echo "OK: verify-workflows (cicd1..2 present, actionlint/YAML clean where available)"
