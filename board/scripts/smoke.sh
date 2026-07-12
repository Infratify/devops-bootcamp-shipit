#!/usr/bin/env bash
#
# smoke.sh — the human-facing end-to-end driver for Ship It's Mission Control.
#
# It POSTs a full pipeline phase sequence to a running board's `POST /api/event`,
# exactly the way a learner's GitHub Actions workflow will, so a ship visibly
# travels  pad → ascending → orbit  on the projector. It also drives the ABORT
# path (a red test grounds the ship — the S2 lesson) and the 401 an unauthorized
# ship gets (the S3 `$SHIPIT_TOKEN` lesson).
#
# This is NOT a CI gate (the only gate in Ship It is the ship's config pre-flight).
# It's a demo/verification driver AND living documentation of the event contract:
# each emit below is one real POST an instructor can watch land on the board.
#
# ── Usage ────────────────────────────────────────────────────────────────────
#   cd board && npm run dev          # start a board (open/dev mode) in another shell
#   board/scripts/smoke.sh           # all: launch → orbit, abort → grounded, token lesson
#   board/scripts/smoke.sh launch    # just the happy path (pad → orbit)
#   board/scripts/smoke.sh abort     # just the abort path (grounded)
#   board/scripts/smoke.sh auth      # just the 401-then-202 token lesson
#
# ── Env (all optional) ───────────────────────────────────────────────────────
#   BOARD_URL       board base URL           (default http://localhost:3000)
#   SHIPIT_TOKEN    Bearer token to send     (unset = dev/open mode, no header)
#   SLEEP           seconds between phases    (default 1.2; set 0 for a fast run)
#   CALLSIGN        launching ship's callsign (default octocat)  — a GitHub username
#   COLOR           launching ship's hex      (default #22d3ee)
#   SITE_URL        live site linked from orbit (default https://<callsign>.github.io/shipit-launchpad/)
#
# ── The contract (board/src/room.js · board/client/placement.js) ─────────────
#   POST /api/event  { callsign, stage, status, color, version?, siteUrl? }
#     stage  ∈ pad · build · test · clearance · liftoff
#     status ∈ running · passed · failed · aborted · shipped
#   zone:  failed|aborted → grounded · liftoff+passed|shipped → orbit · else ascending
#
# ── Reference: the S3 "report to Mission Control" workflow step ───────────────
#   The learner authors this in .github/workflows/deploy.yml in Session 3. It is
#   the real-world twin of one emit() below — same URL, same Bearer, same body.
#
#     - name: Report to Mission Control
#       env:
#         BOARD_URL:    ${{ vars.BOARD_URL }}          # public repo/environment variable
#         SHIPIT_TOKEN: ${{ secrets.SHIPIT_TOKEN }}    # the CI/CD-3 secret
#       run: |
#         curl -fsS -X POST "$BOARD_URL/api/event" \
#           -H "authorization: Bearer $SHIPIT_TOKEN" \
#           -H 'content-type: application/json' \
#           -d "{\"callsign\":\"${{ github.actor }}\",\"stage\":\"liftoff\",\"status\":\"shipped\",\"color\":\"$SHIP_COLOR\",\"siteUrl\":\"$PAGES_URL\"}"
#
set -euo pipefail

# ── config ───────────────────────────────────────────────────────────────────
BOARD_URL="${BOARD_URL:-http://localhost:3000}"
SHIPIT_TOKEN="${SHIPIT_TOKEN:-}"
SLEEP="${SLEEP:-1.2}"
CALLSIGN="${CALLSIGN:-octocat}"
COLOR="${COLOR:-#22d3ee}"
SITE_URL="${SITE_URL:-}"                 # default derived per-callsign below
VERSION="${VERSION:-v1}"
ABORT_CALLSIGN="${ABORT_CALLSIGN:-mayday}"
ABORT_COLOR="${ABORT_COLOR:-#f43f5e}"
AUTH_CALLSIGN="${AUTH_CALLSIGN:-intruder}"

# ── helpers ──────────────────────────────────────────────────────────────────
banner() { printf '\n=== %s ===\n' "$1"; }
pause()  { [ "$SLEEP" != 0 ] && sleep "$SLEEP" || true; }

# raw_post <payload> <bearer|""> → prints the HTTP status code (000 on no response)
raw_post() {
  local payload="$1" bearer="${2-}"
  local -a args=(-sS -o /dev/null -w '%{http_code}'
    -X POST "$BOARD_URL/api/event"
    -H 'content-type: application/json'
    --data "$payload")
  [ -n "$bearer" ] && args+=(-H "authorization: Bearer $bearer")
  curl "${args[@]}" 2>/dev/null || printf '000'
}

# zone_for <stage> <status> → the visual zone, mirroring board/client/placement.js
zone_for() {
  case "$2" in failed|aborted) printf 'grounded'; return;; esac
  if [ "$1" = liftoff ] && { [ "$2" = passed ] || [ "$2" = shipped ]; }; then
    printf 'orbit'; return
  fi
  printf 'ascending'
}

# emit <callsign> <stage> <status> [extra-json] → POST one event, assert 202, report the zone
emit() {
  local callsign="$1" stage="$2" status="$3" extra="${4-}"
  local payload zone code
  payload="{\"callsign\":\"$callsign\",\"stage\":\"$stage\",\"status\":\"$status\",\"color\":\"$COLOR\"$extra}"
  zone="$(zone_for "$stage" "$status")"
  code="$(raw_post "$payload" "$SHIPIT_TOKEN")"
  if [ "$code" = 202 ]; then
    printf '   %-9s %-8s  ->  202  [%s]\n' "$stage" "$status" "$zone"
    return 0
  fi
  # Any non-202 for a well-formed event is a setup problem — fail loud (a convention),
  # even though smoke.sh itself is not a gate.
  printf '   %-9s %-8s  ->  %s  (expected 202)\n' "$stage" "$status" "$code" >&2
  case "$code" in
    401) echo "   ✖ 401 unauthorized — this shell's SHIPIT_TOKEN must match the board's." >&2 ;;
    000) echo "   ✖ no response — is the board at $BOARD_URL running?  (cd board && npm run dev)" >&2 ;;
    400) echo "   ✖ 400 invalid event — the contract drifted from this script." >&2 ;;
  esac
  exit 1
}

require_board() {
  if ! curl -sS -o /dev/null "$BOARD_URL/" 2>/dev/null; then
    echo "✖ No board reachable at $BOARD_URL" >&2
    echo "  Start one first:   cd board && npm run dev" >&2
    exit 1
  fi
  local mode='OPEN/dev (no token)'
  [ -n "$SHIPIT_TOKEN" ] && mode='authenticated (Bearer $SHIPIT_TOKEN)'
  echo "Mission Control: $BOARD_URL  ·  posting as: $mode  ·  pacing: ${SLEEP}s"
}

# ── the launch: pad → ascending → orbit (the green-pipeline payoff) ───────────
demo_launch() {
  local ship="$CALLSIGN"
  local site="${SITE_URL:-https://$ship.github.io/shipit-launchpad/}"
  banner "LAUNCH — $ship:  pad → ascending → orbit"   # COLOR = the launch-ship default
  emit "$ship" pad       running; pause      # S1: the pipeline fires
  emit "$ship" pad       passed;  pause      #     pad lit — site live on Pages
  emit "$ship" build     running; pause
  emit "$ship" build     passed;  pause
  emit "$ship" test      running; pause      # S2: the systems check…
  emit "$ship" test      passed;  pause      #     …green = go
  emit "$ship" clearance running; pause      # S3: cleared to report (needs the token)
  emit "$ship" clearance passed;  pause
  emit "$ship" liftoff   running; pause      # S4: the container is built + deployed
  emit "$ship" liftoff   shipped  ",\"siteUrl\":\"$site\",\"version\":\"$VERSION\""  # → ORBIT
  echo "   ★ $ship is in ORBIT — click it on the board to open $site"
}

# ── the abort: a red test grounds the ship (the S2 lesson made visible) ───────
demo_abort() {
  local ship="$ABORT_CALLSIGN"
  COLOR="$ABORT_COLOR"
  banner "ABORT — $ship:  a red test grounds the ship (the S2 lesson)"
  emit "$ship" pad     running; pause
  emit "$ship" pad     passed;  pause
  emit "$ship" build   running; pause
  emit "$ship" build   passed;  pause
  emit "$ship" test    running; pause        # climbing…
  emit "$ship" test    failed                # …red → grounded
  echo "   ⛔ $ship failed its systems check — grounded on its pad. Fix the config, push again."
}

# ── the token lesson: no clearance → no report (S3) ───────────────────────────
demo_auth() {
  local ship="$AUTH_CALLSIGN"
  local payload="{\"callsign\":\"$ship\",\"stage\":\"pad\",\"status\":\"running\",\"color\":\"$COLOR\"}"
  banner "CLEARANCE — the \$SHIPIT_TOKEN secret (S3)"

  echo "1) A ship with the WRONG token tries to report…"
  local bad; bad="$(raw_post "$payload" 'definitely-not-the-token')"
  case "$bad" in
    401) echo "   → 401 unauthorized  ✔  no clearance, no report to Mission Control." ;;
    202) echo "   → 202 accepted  (board is in OPEN/dev mode — start it with SHIPIT_TOKEN to enforce this)" ;;
    *)   echo "   → $bad  (unexpected — is the board running at $BOARD_URL?)" ;;
  esac
  pause

  echo "2) The same ship with the RIGHT token reports…"
  local good; good="$(raw_post "$payload" "$SHIPIT_TOKEN")"
  case "$good" in
    202) echo "   → 202 accepted  ✔  cleared — the ship can now appear on the board." ;;
    401) echo "   → 401  (set SHIPIT_TOKEN in this shell to the board's token to see the authed path)" ;;
    *)   echo "   → $good  (unexpected)" ;;
  esac
}

usage() {
  sed -n '3,32p' "$0" | sed 's/^# \{0,1\}//'
}

# ── dispatch ─────────────────────────────────────────────────────────────────
mode="${1:-all}"
case "$mode" in
  launch) require_board; demo_launch ;;
  abort)  require_board; demo_abort ;;
  auth)   require_board; demo_auth ;;
  all)    require_board; demo_launch; echo; demo_abort; echo; demo_auth ;;
  -h|--help|help) usage; exit 0 ;;
  *) echo "unknown mode: $mode (want: launch | abort | auth | all)" >&2; exit 2 ;;
esac
