# Milestone 5: the forkable `shipit-launchpad` learner starter — Design

**Date:** 2026-07-12
**Status:** Approved (brainstormed 2026-07-12)
**Scope:** Produce the forkable learner repo `Infratify/shipit-launchpad` *from this monorepo* —
payload-only `main` + `cicd1..4` answer-key branches — as reviewable, locally-verifiable source.
Actual publish (the `gh repo create` + push) is a deferred manual step; M6 automates the ongoing sync.
Parent architecture: `docs/specs/2026-07-11-ship-it-architecture-design.md` §7, §11.5.

---

## 1. What this milestone delivers

The learner-facing starter is a **fork**, not a template (spec §7): each learner forks
`Infratify/shipit-launchpad`, keeps the upstream link, edits `ship.config.json`, and **authors the
pipeline themselves** — a `.github/workflows/deploy.yml` that grows one job per session. The `cicd1..4`
branches are the answer keys slides quote and stuck learners diff against.

M5 produces that repo's content and shape **as source in this monorepo**, plus the tooling to assemble
and verify it. It does **not** push to GitHub (that is one explicit command, run when ready; M6 turns it
into a release workflow). Concretely, M5 adds:

- **`starter/workflows/deploy.cicd1.yml … deploy.cicd4.yml`** — the four progressive workflow end-states.
- **`starter/README.learner.md`** — the fork's repo-root README (fork/enable-Actions preamble + the
  existing customize/run content).
- **`scripts/release-launchpad.sh`** — assembles `main` + `cicd1..4` into a target (local dir by
  default; `--push <remote>` to publish).
- **`scripts/verify-fork-sync.sh`** — mechanically proves the payload-only-`main` discipline with local
  git (0 conflicts on sync).
- **`docs/learner-per-session-commands.md`** — the finalized kelas-taip-bersama command lines.

Everything a learner *runs* already exists in the monorepo (`launchpad/`, `board/`); the only genuinely
new authored content is the four workflows and the two scripts.

### 1.1 Guiding principle — teaching-first

This is a bootcamp prop, not production infra. Where a choice trades fidelity for classroom clarity, we
take clarity: static AWS access keys (what learners set up in AWS-1, not OIDC), a public GHCR package
(anonymous pull, no login dance), workflows that read top-to-bottom for slides. Correctness matters
(slides quote these verbatim), but "a beginner can follow it" outranks "production-hardened."

---

## 2. Repo layout added to this monorepo

```
devops-bootcamp-shipit/                 (the source that produces shipit-launchpad)
  launchpad/            existing — IS the payload (becomes the fork's repo root on main)
  board/                existing — enters the learner repo at cicd4
  starter/                                                   NEW
    workflows/
      deploy.cicd1.yml   S1: Pages deploy on push
      deploy.cicd2.yml   S2: + test gate
      deploy.cicd3.yml   S3: + board POST (secret)
      deploy.cicd4.yml   S4: + build board image + SSM deploy to EC2
    README.learner.md    the fork's repo-root README
  scripts/
    release-launchpad.sh   NEW — assemble main + cicd1..4 (local dir default; --push to publish)
    verify-fork-sync.sh    NEW — prove payload-only-main discipline (local git, 0 conflicts)
  docs/
    learner-per-session-commands.md   NEW — finalized per-session commands
    specs/2026-07-12-launchpad-starter-design.md   this file
```

The four `deploy.yml` versions are **build inputs**, not a learner-facing `docs/reference-workflows/`
(that idea is dropped, spec §7): the answer keys the learner *sees* are the `cicd*` branches. They live
here so slides and M6's sync have one source of truth.

---

## 3. The payload-only `main`

`main` = the contents of `launchpad/` as the repo root, stripped to beginner-clean.

| Keep | Strip |
|---|---|
| `src/` · `public/rocket.glb` · `ship.config.json` · `scripts/preflight.mjs` · `index.html` · `vite.config.js` · `package.json` · `package-lock.json` · README | `node_modules/` · `dist/` · `pnpm-lock.yaml` + `pnpm-workspace.yaml` (monorepo cruft) · `src/*.test.mjs` · `scripts/preflight.test.mjs` · `scripts/__fixtures__/` · the `test:unit` script in `package.json` |

- **Absent by design:** no `.github/workflows/`, no `board/`. The learner authors the first; the second
  arrives at `cicd4`.
- **Why strip the dev-time unit tests:** spec §4 says "no unit-test framework to learn." `npm test` stays
  wired to the preflight gate only (`node scripts/preflight.mjs`), so a learner meets one honest
  exit-code gate, not a pile of `.test.mjs`. (Our own dev-time tests keep living in the monorepo's
  `launchpad/`; they just don't ship to learners.)
- **`vite.config.js` needs no change:** it already uses `base: './'` (relative asset URLs), so the build
  works under any Pages subpath — no coupling to the fork's repo name.
- **`src/` stays `src/`** (not renamed to `ship/`): it is the working Vite convention; the spec's "ship/"
  is loose shorthand and renaming would churn a working app for no learner benefit.
- **`README.learner.md`** replaces `launchpad/README.md` at the root: a short "how this bootcamp works"
  preamble (fork this repo → enable Actions once → each session you author `deploy.yml`) followed by the
  existing *Customize it* / *Run it* content.

---

## 4. The four `deploy.yml` answer keys

Each `cicd*` branch holds the **full correct workflow** at that session's end; the file *grows* one
concern per session (that growth is the lesson). Final YAML is verified against a live board during
implementation; skeletons below fix the shape.

### 4.1 cicd1 / S1 — a pipeline deploys on push (Pages)

One deploy job. `VITE_CALLSIGN` is load-bearing: `src/main.js` reads `import.meta.env.VITE_CALLSIGN`, so
the build must inject the GitHub username (callsign is identity, never in config).

```yaml
name: Ship It
on: { push: { branches: [main] } }
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.deploy.outputs.page_url }}" }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
        env: { VITE_CALLSIGN: "${{ github.actor }}" }
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - id: deploy
        uses: actions/deploy-pages@v4
```

### 4.2 cicd2 / S2 — a test gate can block you

Adds a `test` job (`npm ci && npm test` → the preflight validator); `deploy` gains `needs: test`. A typo'd
`color`/`emblem`/over-long `shipName` → preflight exits non-zero → deploy never runs = **ABORT**. Teaches
the exit-code gate, not test authoring.

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm test            # node scripts/preflight.mjs — bad config exits non-zero
  deploy:
    needs: test
    # …unchanged from cicd1…
```

### 4.3 cicd3 / S3 — secrets let your ship report to Mission Control

Adds board reporting, reusing the exact POST shape `board/scripts/smoke.sh` already documents (same URL,
same Bearer, same body). **Constraint (M4 follow-up, load-bearing):** the board must see **≥1 pre-liftoff
event**, or a ship first-sighted already in orbit snaps in with no launch beat. So the workflow POSTs a
short sequence at natural job boundaries — no fragile `sleep`s:

- **`pad` / `running`** as the pipeline's first step (in the `test` job) — the ship appears on its pad
  while the pipeline runs.
- **`liftoff` / `shipped`** after deploy — carries `siteUrl` (the Pages URL) + `version` (the run SHA).
- **`test` / `failed`** as an `if: failure()` step in the `test` job — the shared board shows the ABORT
  too (`failed → grounded`).

Exact job placement (a step in `test`/`deploy` vs. a dedicated `report` job) is finalized against a live
board during implementation; the constraint the plan must satisfy is the ≥1-pre-liftoff-event rule above.

All to `${{ vars.BOARD_URL }}/api/event` with `Authorization: Bearer ${{ secrets.SHIPIT_TOKEN }}`. A ship
with no/wrong token gets **401** — the "no clearance → can't report" lesson. Representative step:

```yaml
      - name: Report to Mission Control — liftoff
        env:
          BOARD_URL:    ${{ vars.BOARD_URL }}
          SHIPIT_TOKEN: ${{ secrets.SHIPIT_TOKEN }}
          COLOR:        # parsed from ship.config.json (jq)
          PAGES_URL:    ${{ steps.deploy.outputs.page_url }}   # from the deploy-pages step
        run: |
          curl -fsS -X POST "$BOARD_URL/api/event" \
            -H "authorization: Bearer $SHIPIT_TOKEN" \
            -H 'content-type: application/json' \
            -d "{\"callsign\":\"${{ github.actor }}\",\"stage\":\"liftoff\",\"status\":\"shipped\",\"color\":\"$COLOR\",\"version\":\"${{ github.sha }}\",\"siteUrl\":\"$PAGES_URL\"}"
```

`color` is read from `ship.config.json` in a small prior step (`jq -r .color ship.config.json`), keeping
the POST honest to the learner's config.

### 4.4 cicd4 / S4 — your pipeline builds a container and runs it on your server

This branch **also adds `board/`** (the black box learners build but never edit). On top of everything
above it adds a `ship` job — build the board image, push to GHCR, deploy to the learner's own EC2 via SSM:

- **Build + push** `ghcr.io/${{ github.actor }}/shipit-board:${{ github.sha }}` via
  `docker/build-push-action@v6` (context `board`), authenticated with the built-in `GITHUB_TOKEN`
  (`packages: write`). The package is made **public** → the EC2 pulls anonymously (no login on the box).
  This preserves the pinned **two-token** lesson: `GITHUB_TOKEN` ships the image, `SHIPIT_TOKEN`
  authorizes reporting.
- **AWS auth** via `aws-actions/configure-aws-credentials@v4` with `AWS_ACCESS_KEY_ID` /
  `AWS_SECRET_ACCESS_KEY` secrets (the static keys from AWS-1) + region `ap-southeast-1`. OIDC is *not*
  used — it was never taught.
- **Deploy** via `aws ssm send-command --document-name AWS-RunShellScript --instance-ids
  ${{ vars.EC2_INSTANCE_ID }}` running on the EC2 (from AWS-2, `EC2-SSM-Role` already attached, Docker
  installed in the Docker family):

  ```
  docker pull ghcr.io/<actor>/shipit-board:<sha>
  docker rm -f shipit-board || true
  docker run -d --name shipit-board --restart unless-stopped \
    -p 3000:3000 -e SHIPIT_TOKEN=<secret> ghcr.io/<actor>/shipit-board:<sha>
  ```

  The board reads `SHIPIT_TOKEN` from env → runs in prod (auth-enforced) mode.
- **Rollback demo (stretch):** the image is tagged by SHA (→ the `version` field); redeploy a prior tag
  to roll back. Not required hands-on.

The learner still POSTs to the **shared** Mission Control (the S3 step, `vars.BOARD_URL`) **and** now runs
their **own** board on their EC2 — the "your own Mission Control on your server" payoff. Opening
`http://<their-ec2>:3000` shows their standalone board (empty until something reports to it; the lesson is
the container-on-a-server deploy, not a populated board).

### 4.5 Secrets & variables the learner sets (teaching inventory)

| Name | Kind | Session | Purpose |
|---|---|---|---|
| `BOARD_URL` | variable | S3 | shared Mission Control base URL |
| `SHIPIT_TOKEN` | secret | S3 | Bearer for reporting (the CI/CD-3 secret) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | secret | S4 | static AWS keys for SSM deploy |
| `EC2_INSTANCE_ID` | variable | S4 | the learner's own EC2 target |
| `GITHUB_TOKEN` | built-in | S4 | pushes the image to the learner's GHCR (no manual secret) |

---

## 5. Assembly + verification tooling

### 5.1 `scripts/release-launchpad.sh`

Assembles the branch structure with git plumbing into a target — **default: a local directory** under a
temp/scratch path (nothing published); `--push <remote>` publishes to a real repo when ready.

- `main` ← stripped payload (§3) + `README.learner.md`, **no** `.github/workflows/`, **no** `board/`.
- `cicd1` ← `main` + `starter/workflows/deploy.cicd1.yml` as `.github/workflows/deploy.yml`.
- `cicd2` ← `cicd1` + `deploy.cicd2.yml` (replaces the workflow file).
- `cicd3` ← `cicd2` + `deploy.cicd3.yml`.
- `cicd4` ← `cicd3` + `deploy.cicd4.yml` + `board/` (stripped of `node_modules/`, `dist/`).

Idempotent, fail-loud (`set -euo pipefail`). Each `cicdN` is built *on top of* the previous so the diff a
learner sees between branches is exactly the session's added job.

### 5.2 `scripts/verify-fork-sync.sh`

Proves the load-bearing discipline rule (spec §7: upstream `main` must never gain a workflow or re-touch
`ship.config.json`, so learner sync stays conflict-free) using **local git only** — merge mechanics are
identical to a GitHub fork, so no network/repo is needed:

1. Build `main` (via the release script into a temp dir).
2. Clone it as a "learner fork."
3. Learner edits `ship.config.json` + adds `.github/workflows/deploy.yml` (the S1 file), commits.
4. An "instructor fix" lands on upstream `main` — touches a `src/` file, **never** config, **never** a
   workflow.
5. Learner merges upstream `main` → **assert 0 conflicts**.
6. Static asserts: assembled `main` contains no `.github/workflows/`, and the release does not modify
   `ship.config.json` relative to the frozen payload.

Fail-loud: any conflict or a stray workflow on `main` exits non-zero. This is the M5 "verify a fresh fork
syncs cleanly" deliverable, repeatable in CI later.

---

## 6. `docs/learner-per-session-commands.md`

Finalizes the kelas-taip-bersama lines from spec §7 into a single reference the slides lift:

- **Setup (before S1):** fork `Infratify/shipit-launchpad` → enable Actions on the fork (one click).
- **S1:** edit `ship.config.json`; author `.github/workflows/deploy.yml` (type-along) → `git commit -am
  "my ship" && git push` → watch Actions → open the Pages URL.
- **S2:** add the `test` job (type-along); typo the `color` → `git push` → watch it go red (**ABORT**) →
  fix → green.
- **S3:** add the board-POST steps; `gh secret set SHIPIT_TOKEN` + set the `BOARD_URL` variable →
  `git push` → your ship appears on the shared board.
- **S4:** `git checkout upstream/cicd4 -- board/` to pull the dashboard; set `AWS_*` secrets +
  `EC2_INSTANCE_ID` variable; add the `ship` job → `git push` → pipeline builds `board/`, pushes to your
  GHCR, SSM-deploys to your EC2 → open `http://<your-ec2>:3000`.
- **Catch-up (any session):** `git diff upstream/cicdN` to compare, or reset to it if lost. **Sync fork**
  to pull instructor fixes.

---

## 7. Testing / verification

Per the prop's convention (one gate only — the ship's config preflight), M5 adds **no new CI gate**.
Verification is:

- **`verify-fork-sync.sh` passes** (0 conflicts; no workflow on `main`; config untouched) — the
  load-bearing deliverable.
- **`release-launchpad.sh` produces the expected tree** on every branch (asserted: `main` has no
  workflow/`board/`; each `cicdN` has exactly `deploy.yml` = the Nth end-state; `cicd4` has `board/`).
- **Each workflow is YAML-valid and shape-correct**, and the S3/S4 POST bodies match the pinned event
  contract (checked against `board/scripts/smoke.sh`'s documented shape; the POST loop itself is already
  live-verified by M3's smoke test against a real board).
- **The board's own suite stays green** (M5 does not touch `board/` source).

Live end-to-end against a real EC2/Pages is **out of scope** for M5 (no cohort infra in this session); the
workflows are teaching-shaped answer keys, verified by structure + contract review, and dry-runnable.

---

## 8. Non-goals (M5)

- **Publishing** `Infratify/shipit-launchpad` — deferred to an explicit `--push` run; M6 automates the
  ongoing sync + multi-arch GHCR publish.
- **A generic sync framework** — `release-launchpad.sh` is a transparent bash script, matching the prop's
  no-heavy-tooling ethos; M6 promotes it to a workflow.
- **Live EC2/Pages proof** — no cohort infra now; verified by structure + contract, not a real deploy.
- **Renaming `src/` → `ship/`**, adding OIDC, ECR, or private-GHCR login — all rejected as churn or
  untaught surface (see §1.1, §4.4).
```