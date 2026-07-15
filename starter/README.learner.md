# shipit-launchpad — your ship

Your personal **ship microsite** for the DevOps bootcamp: one of four low-poly Three.js spaceships
(Quaternius, CC0) you customize, and the thing your CI/CD pipeline builds, checks, and ships across
the four sessions. A green pipeline launches your ship into the shared **Mission Control** orbit on
the projector.

## How this works

You **forked** this repo. Across four sessions you will **author the pipeline yourself** — the file
`.github/workflows/deploy.yml` does not exist yet; you write it, and it grows one job per session.

1. **Fork** this repo (you've done this).
2. **Enable Actions** on your fork once: the **Actions** tab → *I understand my workflows, go ahead
   and enable them*.
3. **Add the upstream remote** once, so you can reach the answer keys:
   `git remote add upstream https://github.com/Infratify/shipit-launchpad && git fetch upstream`.
4. Each session, edit files and `git push`, then watch the **Actions** tab.

Stuck? The `cicd1`…`cicd4` branches are the answer keys — `git diff upstream/cicd1` to compare, or
reset to one if you're lost. **Sync fork** to pull instructor fixes.

## Customize it

Edit **`ship.config.json`** — the only file you need to touch:

```json
{
  "shipName": "Nebula Runner",
  "color": "#22d3ee",
  "shipModel": "fighter",
  "emblem": "comet"
}
```

- `shipName` — up to 24 characters.
- `color` — a hex colour like `#22d3ee` (recolours your ship — sets its hue to `color`).
- `shipModel` — one of: `fighter`, `interceptor`, `hauler`, `scout`.
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
