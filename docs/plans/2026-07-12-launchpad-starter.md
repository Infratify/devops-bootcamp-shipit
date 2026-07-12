# Launchpad Starter (M5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the forkable `Infratify/shipit-launchpad` learner repo *from this monorepo* — a payload-only `main` plus `cicd1..4` answer-key branches — as reviewable, locally-verifiable source, without publishing.

**Architecture:** Add the only genuinely-new content (four progressive `deploy.yml` end-states, a learner README, a per-session command doc) under `starter/` + `docs/`, then a `release-launchpad.sh` that assembles `main` + `cicd1..4` with git plumbing (payload from `launchpad/`, board from `board/`), and a `verify-fork-sync.sh` that proves the load-bearing payload-only-`main` discipline with local git (0 conflicts). Nothing is pushed; publish is a deferred `--push` run.

**Tech Stack:** GitHub Actions YAML, bash (`set -euo pipefail`), `tar` (portable tree copy), `git` plumbing, `jq`/`node` for small JSON edits, `curl` (event contract). Node 20.

## Global Constraints

- **Node 20, ESM.** Fail loud, no swallowed errors. (spec §1.1, arch §8)
- **No new CI gate.** The prop's only gate is the ship's config preflight; M5 adds verification *scripts*, not gates. (spec §7)
- **Event contract is pinned — do not alter it.** `POST $BOARD_URL/api/event`, `Authorization: Bearer $SHIPIT_TOKEN`, body `{callsign, stage, status, color, version?, siteUrl?}`; `stage ∈ pad|build|test|clearance|liftoff`, `status ∈ running|passed|failed|aborted|shipped`. (CLAUDE.md, arch §6, `board/scripts/smoke.sh`)
- **Identity = `${{ github.actor }}` (callsign); never in config.** Build injects `VITE_CALLSIGN`. (CLAUDE.md)
- **Payload-only-`main` discipline (load-bearing):** assembled `main` must contain **no** `.github/workflows/` and **no** `board/`, and must not re-touch `ship.config.json` relative to the frozen `launchpad/ship.config.json`. (spec §3, §5.2, arch §7)
- **Teaching-first defaults (fixed during brainstorming):** GHCR public package + anonymous pull; static AWS access-key secrets (not OIDC); region `ap-southeast-1`; SSM `AWS-RunShellScript`; two-token lesson (`GITHUB_TOKEN` ships image, `SHIPIT_TOKEN` reports). (spec §1.1, §4.4)
- **Keep `src/` (not `ship/`); `vite.config.js` unchanged** (already `base: './'`). (spec §3)
- Branches build cumulatively: `cicdN` = `cicd(N-1)` + that session's one added concern; `board/` enters only at `cicd4`. (spec §4, §5.1)

---

### Task 1: Learner framing docs (README + per-session commands)

The learner-facing narrative. No code dependencies; lock it first so the workflows and scripts have a stable story to match.

**Files:**
- Create: `starter/README.learner.md`
- Create: `docs/learner-per-session-commands.md`

**Interfaces:**
- Produces: `starter/README.learner.md` (consumed by `release-launchpad.sh` in Task 4 as the fork's root `README.md`). No functions.

- [ ] **Step 1: Write `starter/README.learner.md`**

```markdown
# shipit-launchpad — your ship

Your personal **ship microsite** for the DevOps bootcamp: a Three.js rocket you customize, and the
thing your CI/CD pipeline builds, checks, and ships across the four sessions. A green pipeline
launches your ship into the shared **Mission Control** orbit on the projector.

## How this works

You **forked** this repo. Across four sessions you will **author the pipeline yourself** — the file
`.github/workflows/deploy.yml` does not exist yet; you write it, and it grows one job per session.

1. **Fork** this repo (you've done this).
2. **Enable Actions** on your fork once: the **Actions** tab → *I understand my workflows, go ahead
   and enable them*.
3. Each session, edit files and `git push`, then watch the **Actions** tab.

Stuck? The `cicd1`…`cicd4` branches are the answer keys — `git diff upstream/cicd1` to compare, or
reset to one if you're lost. **Sync fork** to pull instructor fixes.

## Customize it

Edit **`ship.config.json`** — the only file you need to touch:

```json
{
  "shipName": "Nebula Runner",
  "color": "#22d3ee",
  "emblem": "comet"
}
```

- `shipName` — up to 24 characters.
- `color` — a hex colour like `#22d3ee` (tints your rocket).
- `emblem` — one of: `comet`, `bolt`, `star`, `ring`, `delta`, `phoenix`.

Your **callsign** is your GitHub username — it's set automatically when the pipeline runs.

## Run it locally

```bash
npm install
npm run dev        # live preview
npm test           # pre-flight check — fails (ABORT) if ship.config.json is invalid
npm run build      # static site → dist/
npm run preview    # serve the built site on :8080
```

`npm test` is the pre-flight gate: a bad `ship.config.json` exits non-zero and blocks the launch.
```

- [ ] **Step 2: Write `docs/learner-per-session-commands.md`**

```markdown
# Ship It — per-session commands (kelas-taip-bersama)

The type-along command lines for each CI/CD session. Slides lift these verbatim. The learner **forks**
`Infratify/shipit-launchpad` and **authors** `.github/workflows/deploy.yml`, which grows one job per
session. Answer keys = the `cicd1..4` branches.

## Setup (before S1)
- **Fork** `Infratify/shipit-launchpad`.
- **Enable Actions** on the fork (Actions tab → enable). One-time click.

## S1 — a pipeline deploys on push
- Edit `ship.config.json` (your callsign is your GitHub username, set automatically).
- Author `.github/workflows/deploy.yml` (type-along) — the S1 Pages deploy.
- `git commit -am "my ship" && git push` → watch **Actions** → open the Pages URL.

## S2 — a test gate can block you
- Add the `test` job to `deploy.yml` (type-along).
- Typo the `color` in `ship.config.json` → `git push` → watch it go **red (ABORT)** → fix → green.

## S3 — secrets let your ship report to Mission Control
- Add the board-report steps to `deploy.yml`.
- Set the secret + variable:
  - `gh secret set SHIPIT_TOKEN`      (the CI/CD-3 secret)
  - `gh variable set BOARD_URL --body "http://<instructor-board>:3000"`
- `git push` → your ship appears live on the shared board. A missing/wrong token → the run goes red
  (401 — the "no clearance" lesson).

## S4 — your pipeline builds a container and runs it on your server
- Pull the dashboard payload: `git checkout upstream/cicd4 -- board/`
- Set the deploy inputs:
  - `gh secret set AWS_ACCESS_KEY_ID`      (from AWS-1)
  - `gh secret set AWS_SECRET_ACCESS_KEY`
  - `gh variable set EC2_INSTANCE_ID --body "i-0123456789abcdef0"`   (your EC2 from AWS-2)
- Add the `ship` job to `deploy.yml` → `git push`.
- The pipeline builds `board/`, pushes `ghcr.io/<you>/shipit-board`, and SSM-deploys it to your EC2.
- Make the GHCR package **public** (Packages → shipit-board → Package settings → Change visibility) so
  the EC2 can pull it.
- Open `http://<your-ec2>:3000` — your own Mission Control. **LIFTOFF.**

## Catch-up (any session)
- `git diff upstream/cicdN` to compare against the answer key, or reset to it if lost.
- **Sync fork** to pull instructor fixes (stays conflict-free — you only ever *add* `deploy.yml` and
  *edit* `ship.config.json`).
```

- [ ] **Step 3: Verify the docs name every secret/variable and setup step**

Run:
```bash
cd /home/debian/repo/devops-bootcamp-shipit
for s in SHIPIT_TOKEN BOARD_URL AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY EC2_INSTANCE_ID; do
  grep -q "$s" docs/learner-per-session-commands.md || { echo "MISSING: $s"; exit 1; }
done
grep -qi "enable actions" docs/learner-per-session-commands.md || { echo "MISSING: enable Actions"; exit 1; }
grep -qi "fork" starter/README.learner.md || { echo "MISSING: fork preamble"; exit 1; }
echo "OK: framing docs consistent"
```
Expected: `OK: framing docs consistent`

- [ ] **Step 4: Commit**

```bash
git add starter/README.learner.md docs/learner-per-session-commands.md
git commit -m "docs(starter): learner README + per-session commands (M5, #5)"
```

---

### Task 2: S1 + S2 workflows + verify harness

The serverless half of the arc (Pages deploy, then the test gate) plus the structural verifier both this task and Task 3 use.

**Files:**
- Create: `scripts/verify-workflows.sh`
- Create: `starter/workflows/deploy.cicd1.yml`
- Create: `starter/workflows/deploy.cicd2.yml`

**Interfaces:**
- Produces: `scripts/verify-workflows.sh` (extended in Task 3); the four `starter/workflows/deploy.cicd*.yml` (consumed by `release-launchpad.sh` in Task 4).

- [ ] **Step 1: Write the failing verifier `scripts/verify-workflows.sh`**

```bash
#!/usr/bin/env bash
# verify-workflows.sh — structural + contract checks on the four answer-key workflows.
# Not a CI gate; a fail-loud sanity check the release relies on. Runs actionlint if present.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
WF="$ROOT/starter/workflows"

fail() { echo "FAIL: $1" >&2; exit 1; }
# has() checks existence first so a not-yet-created file gives a clean "missing" message.
# `--` terminates grep option parsing so patterns beginning with `-` (e.g. `-p 3000:3000`) match literally.
has()  { [ -f "$1" ] || fail "missing $1"; grep -Fq -- "$2" "$1" || fail "$(basename "$1"): missing '$2'"; }

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
```

- [ ] **Step 2: Run it to confirm it fails (files absent)**

Run:
```bash
cd /home/debian/repo/devops-bootcamp-shipit && chmod +x scripts/verify-workflows.sh && ./scripts/verify-workflows.sh
```
Expected: FAIL with `missing …/deploy.cicd1.yml`

- [ ] **Step 3: Write `starter/workflows/deploy.cicd1.yml`**

```yaml
name: Ship It
on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          VITE_CALLSIGN: ${{ github.actor }}   # your callsign = your GitHub username
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Write `starter/workflows/deploy.cicd2.yml`**

```yaml
name: Ship It
on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test        # node scripts/preflight.mjs — a bad ship.config.json ABORTS here

  deploy:
    needs: test              # deploy only runs if the pre-flight gate is green
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          VITE_CALLSIGN: ${{ github.actor }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 5: Run the verifier to confirm it passes**

Run: `./scripts/verify-workflows.sh`
Expected: `OK: verify-workflows (cicd1..2 present, actionlint/YAML clean where available)`

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-workflows.sh starter/workflows/deploy.cicd1.yml starter/workflows/deploy.cicd2.yml
git commit -m "feat(starter): S1 Pages deploy + S2 test gate answer keys (M5, #5)"
```

---

### Task 3: S3 + S4 workflows + extended verifier

The reporting + container half. cicd3 adds board reporting (the pinned contract, ≥1 pre-liftoff event); cicd4 adds the build+SSM `ship` job and brings in `board/`.

**Files:**
- Modify: `scripts/verify-workflows.sh` (add cicd3/cicd4 assertions before the final echo)
- Create: `starter/workflows/deploy.cicd3.yml`
- Create: `starter/workflows/deploy.cicd4.yml`

**Interfaces:**
- Consumes: `scripts/verify-workflows.sh` from Task 2.
- Produces: `deploy.cicd3.yml`, `deploy.cicd4.yml`.

- [ ] **Step 1: Extend `scripts/verify-workflows.sh` — add cicd3/4 assertions**

Replace the final `echo "OK: …"` line with the block below (keeps everything above it):

```bash
# cicd3 — board reporting, pinned contract, >=1 pre-liftoff event
has "$WF/deploy.cicd3.yml" 'Bearer $SHIPIT_TOKEN'
has "$WF/deploy.cicd3.yml" '${{ vars.BOARD_URL }}'   # env: line
has "$WF/deploy.cicd3.yml" '/api/event'              # curl target (BOARD_URL is an env var there)
has "$WF/deploy.cicd3.yml" '\"stage\":\"pad\",\"status\":\"running\"'          # pre-liftoff beat
has "$WF/deploy.cicd3.yml" '\"stage\":\"liftoff\",\"status\":\"shipped\"'
has "$WF/deploy.cicd3.yml" '\"stage\":\"test\",\"status\":\"failed\"'          # abort report
has "$WF/deploy.cicd3.yml" "if: failure()"
has "$WF/deploy.cicd3.yml" "needs: test"

# cicd4 — build board image (GHCR) + SSM deploy to the learner's EC2
has "$WF/deploy.cicd4.yml" "docker/build-push-action@v6"
has "$WF/deploy.cicd4.yml" "context: board"
has "$WF/deploy.cicd4.yml" "ghcr.io/"
has "$WF/deploy.cicd4.yml" "packages: write"
has "$WF/deploy.cicd4.yml" "aws-actions/configure-aws-credentials@v4"
has "$WF/deploy.cicd4.yml" "aws-region: ap-southeast-1"
has "$WF/deploy.cicd4.yml" "ssm send-command"
has "$WF/deploy.cicd4.yml" "AWS-RunShellScript"
has "$WF/deploy.cicd4.yml" "-p 3000:3000"
has "$WF/deploy.cicd4.yml" "SHIPIT_TOKEN="
has "$WF/deploy.cicd4.yml" '${{ vars.EC2_INSTANCE_ID }}'
# cicd4 still reports to the SHARED board (S3 step preserved)
has "$WF/deploy.cicd4.yml" '\"stage\":\"liftoff\",\"status\":\"shipped\"'

echo "OK: verify-workflows (cicd1..4 present, contract + shape asserted)"
```

- [ ] **Step 2: Run it to confirm it fails (cicd3/4 absent)**

Run: `./scripts/verify-workflows.sh`
Expected: FAIL with `missing …/deploy.cicd3.yml`

- [ ] **Step 3: Write `starter/workflows/deploy.cicd3.yml`**

```yaml
name: Ship It
on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: cfg
        run: echo "color=$(jq -r .color ship.config.json)" >> "$GITHUB_OUTPUT"
      - name: Report to Mission Control — on the pad
        env:
          BOARD_URL: ${{ vars.BOARD_URL }}
          SHIPIT_TOKEN: ${{ secrets.SHIPIT_TOKEN }}
        run: |
          curl -fsS -X POST "$BOARD_URL/api/event" \
            -H "authorization: Bearer $SHIPIT_TOKEN" \
            -H 'content-type: application/json' \
            -d "{\"callsign\":\"${{ github.actor }}\",\"stage\":\"pad\",\"status\":\"running\",\"color\":\"${{ steps.cfg.outputs.color }}\"}"
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - name: Report ABORT if the pre-flight failed
        if: failure()
        env:
          BOARD_URL: ${{ vars.BOARD_URL }}
          SHIPIT_TOKEN: ${{ secrets.SHIPIT_TOKEN }}
        run: |
          curl -fsS -X POST "$BOARD_URL/api/event" \
            -H "authorization: Bearer $SHIPIT_TOKEN" \
            -H 'content-type: application/json' \
            -d "{\"callsign\":\"${{ github.actor }}\",\"stage\":\"test\",\"status\":\"failed\",\"color\":\"${{ steps.cfg.outputs.color }}\"}"

  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - id: cfg
        run: echo "color=$(jq -r .color ship.config.json)" >> "$GITHUB_OUTPUT"
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          VITE_CALLSIGN: ${{ github.actor }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deploy
        uses: actions/deploy-pages@v4
      - name: Report to Mission Control — liftoff
        env:
          BOARD_URL: ${{ vars.BOARD_URL }}
          SHIPIT_TOKEN: ${{ secrets.SHIPIT_TOKEN }}
        run: |
          curl -fsS -X POST "$BOARD_URL/api/event" \
            -H "authorization: Bearer $SHIPIT_TOKEN" \
            -H 'content-type: application/json' \
            -d "{\"callsign\":\"${{ github.actor }}\",\"stage\":\"liftoff\",\"status\":\"shipped\",\"color\":\"${{ steps.cfg.outputs.color }}\",\"version\":\"${{ github.sha }}\",\"siteUrl\":\"${{ steps.deploy.outputs.page_url }}\"}"
```

- [ ] **Step 4: Write `starter/workflows/deploy.cicd4.yml`**

Same as cicd3, plus a `ship` job. Full file:

```yaml
name: Ship It
on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: cfg
        run: echo "color=$(jq -r .color ship.config.json)" >> "$GITHUB_OUTPUT"
      - name: Report to Mission Control — on the pad
        env:
          BOARD_URL: ${{ vars.BOARD_URL }}
          SHIPIT_TOKEN: ${{ secrets.SHIPIT_TOKEN }}
        run: |
          curl -fsS -X POST "$BOARD_URL/api/event" \
            -H "authorization: Bearer $SHIPIT_TOKEN" \
            -H 'content-type: application/json' \
            -d "{\"callsign\":\"${{ github.actor }}\",\"stage\":\"pad\",\"status\":\"running\",\"color\":\"${{ steps.cfg.outputs.color }}\"}"
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - name: Report ABORT if the pre-flight failed
        if: failure()
        env:
          BOARD_URL: ${{ vars.BOARD_URL }}
          SHIPIT_TOKEN: ${{ secrets.SHIPIT_TOKEN }}
        run: |
          curl -fsS -X POST "$BOARD_URL/api/event" \
            -H "authorization: Bearer $SHIPIT_TOKEN" \
            -H 'content-type: application/json' \
            -d "{\"callsign\":\"${{ github.actor }}\",\"stage\":\"test\",\"status\":\"failed\",\"color\":\"${{ steps.cfg.outputs.color }}\"}"

  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - id: cfg
        run: echo "color=$(jq -r .color ship.config.json)" >> "$GITHUB_OUTPUT"
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          VITE_CALLSIGN: ${{ github.actor }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deploy
        uses: actions/deploy-pages@v4
      - name: Report to Mission Control — liftoff
        env:
          BOARD_URL: ${{ vars.BOARD_URL }}
          SHIPIT_TOKEN: ${{ secrets.SHIPIT_TOKEN }}
        run: |
          curl -fsS -X POST "$BOARD_URL/api/event" \
            -H "authorization: Bearer $SHIPIT_TOKEN" \
            -H 'content-type: application/json' \
            -d "{\"callsign\":\"${{ github.actor }}\",\"stage\":\"liftoff\",\"status\":\"shipped\",\"color\":\"${{ steps.cfg.outputs.color }}\",\"version\":\"${{ github.sha }}\",\"siteUrl\":\"${{ steps.deploy.outputs.page_url }}\"}"

  # S4: build the board image and run it on YOUR OWN EC2 (your personal Mission Control)
  ship:
    needs: deploy
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write         # push the image to your GHCR
    steps:
      - uses: actions/checkout@v4
      - id: ghcr
        run: echo "owner=${GITHUB_ACTOR,,}" >> "$GITHUB_OUTPUT"   # GHCR needs a lowercase owner
      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push the board image
        uses: docker/build-push-action@v6
        with:
          context: board
          push: true
          tags: ghcr.io/${{ steps.ghcr.outputs.owner }}/shipit-board:${{ github.sha }}
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-southeast-1
      - name: Deploy the board to my EC2 via SSM
        env:
          IMAGE: ghcr.io/${{ steps.ghcr.outputs.owner }}/shipit-board:${{ github.sha }}
          SHIPIT_TOKEN: ${{ secrets.SHIPIT_TOKEN }}
        run: |
          aws ssm send-command \
            --instance-ids "${{ vars.EC2_INSTANCE_ID }}" \
            --document-name "AWS-RunShellScript" \
            --comment "Ship It S4 — deploy $IMAGE" \
            --parameters commands="[\"docker pull $IMAGE\",\"docker rm -f shipit-board || true\",\"docker run -d --name shipit-board --restart unless-stopped -p 3000:3000 -e SHIPIT_TOKEN=$SHIPIT_TOKEN $IMAGE\"]"
```

- [ ] **Step 5: Run the verifier to confirm it passes**

Run: `./scripts/verify-workflows.sh`
Expected: `OK: verify-workflows (cicd1..4 present, contract + shape asserted)`

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-workflows.sh starter/workflows/deploy.cicd3.yml starter/workflows/deploy.cicd4.yml
git commit -m "feat(starter): S3 board reporting + S4 build/SSM answer keys (M5, #5)"
```

---

### Task 4: `release-launchpad.sh` — assemble main + cicd1..4

Assembles the learner repo's branch structure from monorepo sources into a local git repo. Default: build only; `--push <remote>` publishes.

**Files:**
- Create: `scripts/release-launchpad.sh`
- Create: `scripts/release-launchpad.test.sh`
- Modify: `.gitignore` (add `.launchpad-release/`)

**Interfaces:**
- Consumes: `launchpad/` (payload), `board/`, `starter/workflows/deploy.cicd*.yml`, `starter/README.learner.md`.
- Produces: `release-launchpad.sh` with signature `release-launchpad.sh [--out DIR] [--push REMOTE]` → builds branches `main cicd1 cicd2 cicd3 cicd4` in `DIR` (default `$ROOT/.launchpad-release`), prints a summary. Consumed by `verify-fork-sync.sh` (Task 5).

- [ ] **Step 1: Write the failing test `scripts/release-launchpad.test.sh`**

```bash
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
```

- [ ] **Step 2: Run it to confirm it fails (script absent)**

Run:
```bash
cd /home/debian/repo/devops-bootcamp-shipit && chmod +x scripts/release-launchpad.test.sh && ./scripts/release-launchpad.test.sh
```
Expected: FAIL (`release-launchpad.sh: No such file` / non-zero)

- [ ] **Step 3: Write `scripts/release-launchpad.sh`**

```bash
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
```

- [ ] **Step 4: Add `.launchpad-release/` to `.gitignore`**

Append the line `.launchpad-release/` to `.gitignore`:
```bash
cd /home/debian/repo/devops-bootcamp-shipit
printf '\n# M5: local output of scripts/release-launchpad.sh\n.launchpad-release/\n' >> .gitignore
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `chmod +x scripts/release-launchpad.sh && ./scripts/release-launchpad.test.sh`
Expected: `OK: release produces correct main + cicd1..4 trees`

- [ ] **Step 6: Commit**

```bash
git add scripts/release-launchpad.sh scripts/release-launchpad.test.sh .gitignore
git commit -m "feat(starter): release-launchpad.sh assembles main + cicd1..4 (M5, #5)"
```

---

### Task 5: `verify-fork-sync.sh` — prove the payload-only-main discipline

The load-bearing deliverable: prove a fresh fork syncs instructor fixes with **zero conflicts**, using only local git.

**Files:**
- Create: `scripts/verify-fork-sync.sh`

**Interfaces:**
- Consumes: `scripts/release-launchpad.sh` (Task 4), `starter/workflows/deploy.cicd1.yml`.
- Produces: `verify-fork-sync.sh` (exit 0 = clean sync + invariants hold).

- [ ] **Step 1: Write `scripts/verify-fork-sync.sh`**

```bash
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
```

- [ ] **Step 2: Run it to confirm it passes**

Run:
```bash
cd /home/debian/repo/devops-bootcamp-shipit && chmod +x scripts/verify-fork-sync.sh && ./scripts/verify-fork-sync.sh
```
Expected: `PASS: fresh fork synced an instructor fix with 0 conflicts (discipline holds)`

- [ ] **Step 3: Sanity — the other verifiers still pass**

Run:
```bash
./scripts/verify-workflows.sh && ./scripts/release-launchpad.test.sh
```
Expected: both `OK: …`

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-fork-sync.sh
git commit -m "feat(starter): verify-fork-sync.sh proves 0-conflict fork sync (M5, #5)"
```

---

## Final verification (after all tasks)

- [ ] Run all three verifiers clean:
  ```bash
  ./scripts/verify-workflows.sh && ./scripts/release-launchpad.test.sh && ./scripts/verify-fork-sync.sh
  ```
- [ ] Confirm M5 touched nothing in `launchpad/` or `board/` source: `git diff --stat main -- launchpad board` shows no source changes (only new top-level `starter/`, `scripts/`, `docs/`).
- [ ] Manually eyeball one assembled workflow end-to-end: `cat .launchpad-release/.github/workflows/deploy.yml` after `git -C .launchpad-release checkout cicd4`.
- [ ] Update memory `shipit-milestone-status.md`: M5 done (source built + locally verified; publish deferred), next = M6.

## Deferred to publish / M6 (not in this plan)

- Actual `gh repo create Infratify/shipit-launchpad --public` + `release-launchpad.sh --push git@github.com:Infratify/shipit-launchpad.git`.
- Enabling branch protection / making it "fork-friendly"; a real fork-sync smoke on GitHub.
- Multi-arch GHCR publish of `shipit-board` + promoting `release-launchpad.sh` to a release workflow.
- **Known teaching simplification to note on slides:** the S4 SSM command interpolates `SHIPIT_TOKEN` into the RunShellScript parameters (visible in AWS command history) — acceptable for the prop; a SecureString param would harden it.
```