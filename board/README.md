# shipit-board — Mission Control

The shared CI/CD orbit for the Ship It bootcamp prop: a Node process that ingests
pipeline events over HTTP and streams a live roster to a Three.js spectator over
WebSocket. Dual-role — the instructor runs the shared instance; each learner builds
and deploys their own copy to their EC2 in the S4 capstone.

## Run (local)

```bash
npm install
npm run dev        # builds the client, then serves it + the ws hub on :3000
# open http://localhost:3000
```

`npm run dev` runs in **open mode** (no `SHIPIT_TOKEN`) and prints a warning — any
POST is accepted, so you can drive it with curl:

```bash
curl -XPOST localhost:3000/api/event -H 'content-type: application/json' \
  -d '{"callsign":"octocat","stage":"liftoff","status":"shipped","color":"#22d3ee","siteUrl":"https://example.com"}'
```

## Auth

Set `SHIPIT_TOKEN` to enforce Bearer auth on `POST /api/event`:

```bash
SHIPIT_TOKEN=sooper-secret npm start
curl -XPOST localhost:3000/api/event -H 'authorization: Bearer sooper-secret' \
  -H 'content-type: application/json' -d '{"callsign":"octocat","stage":"pad","status":"running","color":"#22d3ee"}'
```

## Event contract

`POST /api/event` — `{ callsign, stage, status, color, version?, siteUrl? }`
· `stage ∈ {pad,build,test,clearance,liftoff}` · `status ∈ {running,passed,failed,aborted,shipped}`.

## Smoke test / live demo

`scripts/smoke.sh` is a `curl` driver that POSTs a full phase sequence to a running
board — the way a learner's GitHub Actions workflow will — so you can watch a ship
travel **pad → ascending → orbit** on the projector. It doubles as living
documentation of the event contract (each `emit` is one real POST). It is a demo
driver, **not a gate**.

```bash
cd board && npm run dev          # start a board in another shell
scripts/smoke.sh                 # all: launch → orbit, abort → grounded, token lesson
scripts/smoke.sh launch          # just the happy path (pad → orbit)
scripts/smoke.sh abort           # just the abort path (red test → grounded)
scripts/smoke.sh auth            # just the 401-then-202 $SHIPIT_TOKEN lesson
```

Reads `BOARD_URL` (default `http://localhost:3000`) and `SHIPIT_TOKEN` (unset ⇒
dev/open mode) from env; `SLEEP=0 scripts/smoke.sh` runs it fast for verification.
Against a token-enforcing board, set `SHIPIT_TOKEN` to the board's token — a
mismatch gets the `401` an unauthorized ship sees (the S3 lesson).

## Test

```bash
npm test           # node --test: room, server (the loop), placement, fallback
```

## Docker

```bash
docker build -t shipit-board .
docker run -p 3000:3000 -e SHIPIT_TOKEN=sooper-secret shipit-board
```

## Env

- `PORT` (default `3000`)
- `SHIPIT_TOKEN` (unset ⇒ open/dev mode)
