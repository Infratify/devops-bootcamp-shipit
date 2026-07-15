# Ship It — per-session commands (kelas-taip-bersama)

The type-along command lines for each CI/CD session. Slides lift these verbatim. The learner **forks**
`Infratify/shipit-launchpad` and **authors** `.github/workflows/deploy.yml`, which grows one job per
session. Answer keys = the `cicd1..4` branches.

## Setup (before S1)
- **Fork** `Infratify/shipit-launchpad`.
- **Enable Actions** on the fork (Actions tab → enable). One-time click.
- **Add the upstream remote** (needed for the answer keys + the S4 `board/` pull; GitHub's *Sync fork*
  button does **not** create a local `upstream`):
  `git remote add upstream https://github.com/Infratify/shipit-launchpad && git fetch upstream`.

## S1 — a pipeline deploys on push
- Edit `ship.config.json` (your callsign is your GitHub username, set automatically) — pick your
  `shipModel` (`fighter` · `interceptor` · `hauler` · `scout`) and `color`; `color` recolours it.
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
- **First run only:** the new GHCR package is **private** by default, so your EC2 can't pull it yet —
  make it **public** (Packages → shipit-board → Package settings → Change visibility), then re-run the
  workflow. (`aws ssm send-command` dispatches the deploy fire-and-forget: a green run means "command
  sent", so give the container a few seconds to pull and start.)
- Open `http://<your-ec2>:3000` — your own Mission Control. **LIFTOFF.**

## Catch-up (any session)
- `git diff upstream/cicdN` to compare against the answer key, or reset to it if lost.
- **Sync fork** to pull instructor fixes (stays conflict-free — you only ever *add* `deploy.yml` and
  *edit* `ship.config.json`).
