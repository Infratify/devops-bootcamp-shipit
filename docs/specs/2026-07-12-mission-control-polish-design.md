# Mission Control Polish — Design (Milestone 4)

**Date:** 2026-07-12
**Status:** Approved — proceeding to plan
**Scope:** The `board/` client scene + styling + Dockerfile only (spec §4, §5, §8, §11.4; GitHub issue #5).
Turn the correct-but-plain M2 board into the projector **spectacle**. It is a teaching prop:
**pedagogy-first, sensible defaults, no over-engineering.** *Visual only* — no server, contract, or
`placement()` change.

**Reads with:** `CLAUDE.md` (pinned event contract + component roles), `docs/specs/2026-07-11-ship-it-architecture-design.md`
(§4 aesthetic, §5 board, §8 conventions, §11.4 milestone), the board MVP design
`docs/specs/2026-07-12-board-mvp-design.md` (every line marked "→ M4" is *this* milestone), GitHub
issue #5, and the sibling `~/repo/devops-bootcamp-app` (`src/scene/world.js`, `src/style.css`) — the
**visual bar to match**.

---

## 1. What this milestone delivers

The M2 board is correct but deliberately plain. M4 makes it the thing that earns the projector: a
ship that reaches orbit **visibly launches** instead of teleporting; the scene reads as the sibling's
**blueprint** world (deep navy, cyan grid, bloom glow, monospace); it is **legible from the back of a
room**; and the shared orbit reads as **N distinct evenly-ringed ships** (the payoff that made the
arena land), not a clump. Fallbacks stay honest, and the Dockerfile gets the M2-deferred hardening.

**The hard invariant:** `client/placement.js` (the pure `(stage,status) → {zone,t}` mapping) and the
pinned event contract **do not change** — slides and `board/scripts/smoke.sh` depend on them. Every
M4 change lives in the scene rendering, the styling, and the Dockerfile.

## 2. Resolved decisions (the two forks the issue left open)

| # | Decision | Resolution |
|---|---|---|
| Render/animation stack | full sibling parity vs. lean | **Hybrid.** Add `UnrealBloomPass` via `EffectComposer` — it is bundled in the `three` package (`three/addons`), so **zero new npm deps** — and it is the single change that makes the board read as the sibling and glow on a projector. Hand-roll the launch easing in the existing tick loop; **no `animejs`.** |
| Launch spectacle depth | minimal ↔ maximal | **Focused beat.** Per ship: anticipation charge → thrust ascent with an exhaust trail → eased arc into the orbit slot → settle, plus a `LIFTOFF ✦ @callsign` HUD toast. **Static camera** (slow idle drift). **No** literal 3-2-1 numerals (they don't map to ~60 asynchronous launches), **no** starfield / screen-flash / per-launch camera moves. |

Both were confirmed with the user; the goal is **teaching**, so sensible defaults win over maximal spectacle.

## 3. Module structure (`board/client/`)

`scene.js` (~123 lines) already carries scene setup + tick + placement + click + dispose. M4 adds
animation, bloom, and the even-spacing fix — too much for one file. Split by concern, and make the two
bug-prone bits **pure and unit-tested** (the board's existing `placement.js` pattern):

| File | Role | Tested |
|---|---|---|
| `scene.js` | orchestrator: renderer + **`EffectComposer`/bloom** + camera + lights + grid + tick + click + dispose; owns the ship registry `Map` and applies poses | WebGL — no (build + smoke) |
| `theme.js` *(new)* | the blueprint palette + layout + timing constants — one source of truth for the look and the tuning knobs | trivially, no |
| `ship-mesh.js` | extend: emissive tint (so it blooms), projector-legible label, a hidden exhaust-trail child | no |
| `launch.js` *(new)* | **pure** launch-timing helpers — phase-for-elapsed, eased fractions, total duration, `isComplete`. **No `three`/DOM import** | **yes** — `client/launch.test.js` |
| `orbit.js` *(new)* | **pure** even-spacing — `orbitAngle(indexAmongOrbiting, orbitingCount, baseAngle)`. **No `three`/DOM import** | **yes** — `client/orbit.test.js` |
| `placement.js` | **UNCHANGED** (contract) | yes (existing) |
| `fallback.js` | light blueprint restyle; still motion-free | yes (existing) |
| `main.js` | unchanged bootstrap/ws (fallback-detect → scene \| roster) | — |

**Testability constraint (load-bearing):** `orbit.js` and `launch.js` MUST import no `three` and touch
no `document`/`window` at module top — exactly like `placement.js` — so `node --test` can import them.
`scene.js` does the THREE math (`Math.cos/sin`, `Vector3.lerp`) using the numbers these pure modules
return. This is what keeps the named bug and the launch timing **testable without a WebGL/jsdom harness**.

## 4. Blueprint aesthetic — `theme.js` + `scene.js` + `ship-mesh.js` + `style.css`

Match the sibling's bar (`devops-bootcamp-app/src/scene/world.js`, `src/style.css`):

- **Renderer/scene:** `WebGLRenderer({ antialias: true })` with **`alpha: false`**; `scene.background =
  Color('#0b1220')`; `scene.fog = FogExp2('#0b1220', ~0.02)` for depth (kept low so the orbit ring stays
  legible). *(Bloom needs an opaque background — this replaces the current `alpha:true`-over-CSS setup.)*
- **Blueprint grid:** a `GridHelper` on the pad plane, cyan `#38f5c9` / dim `#173b46`, `transparent`,
  opacity ~0.3 — the schematic floor. Keep a faint pad disc as the launch-origin marker.
- **Bloom:** `EffectComposer(renderer)` → `RenderPass(scene, camera)` → `UnrealBloomPass(Vector2(w,h),
  strength ≈ 0.6, radius ≈ 0.6, threshold ≈ 0.2)` (sibling values). The tick renders via
  **`composer.render()`** instead of `renderer.render()`; `onResize` updates the composer + bloom
  resolution too. All three are tuning knobs in `theme.js`.
- **Ships glow:** ship material gets `emissive` = its tint at low intensity so it reads as lit and blooms;
  the orbit **ring** is brightened (emissive/basic bright cyan) so it blooms into a glowing halo.
- **Lighting:** `HemisphereLight('#22d3ee','#020617', ~0.6)` + `DirectionalLight('#8ecbff', ~0.8)` (sibling).
- **DOM chrome:** `style.css` body/background → `#0b1220`, HUD → monospace/cyan (§6). Palette lives once
  in `theme.js` (scene) and mirrored in the CSS custom properties for the DOM chrome.

## 5. Launch animation — `launch.js` (pure timing) + `scene.js` (applies it)

**The ease-to-target foundation.** Each ship record holds a current pose; every frame the scene eases it
toward a **target** pose derived from `placement()` + orbit spacing (§7), using frame-rate-independent
damping (`alpha = 1 - exp(-k·dt)`). So ascending-height changes and orbit redistribution are **never
teleports** either — the launch is the one scripted, richer transition layered on top.

**Trigger — only on a live observed transition.** The scene tracks `rec.lastZone`. A `LaunchSequence`
starts **only** when `lastZone` is defined, `lastZone !== 'orbit'`, and the new zone **is** `'orbit'`. A
ship first seen *already* in orbit (a spectator connecting mid-session) **snaps** into its orbit slot — no
replayed launch, so reconnects don't trigger a chaotic mass re-launch.

**Phases** (durations in `theme.js`, ~2.8s total; `launch.js` maps `elapsed → {phase, eased fraction}`):

1. **CHARGE** (~0.6s) — slight downward crouch, emissive pulse up, exhaust trail ignites. Anticipation.
2. **THRUST** (~1.2s) — ease-in ascent up past orbit height; trail streams. **Fire the `LIFTOFF ✦ @callsign`
   HUD toast** at phase start.
3. **ARC** (~1.0s) — eased arc from the thrust apex over to the orbit-slot position; trail fades out.
4. **SETTLE** — sequence ends; the ship hands back to the normal ease-to-target orbit ride (trail off).

**Aborts / interruptions:** if a ship's placement flips to `grounded` (failed/aborted) mid-launch, cancel
the sequence and ease to the grounded pad marker. Color change mid-flight rebuilds the mesh (existing
logic) and resets to the current target — a rare, acceptable reset.

**Exhaust trail:** a small elongated additive-blended child on the ship group, `emissive`/bright so it
blooms, `visible=false` except during CHARGE→ARC. Procedural and cheap; disposed with the ship.

## 6. Projector legibility + HUD

- **Labels:** larger canvas + font; **white text with a dark outline/pill** drawn on the canvas so the
  callsign is readable over any ship tint and over the grid; sprites already face the camera. This is the
  "60 *distinct* ships" payoff — identity must stay readable from the back of the room.
- **Camera:** framed so the pad **and the full orbit ring** sit comfortably in view with margin; **static**
  with a very slow idle drift. Keep the sibling's narrow-viewport `camera.zoom` clamp as a safety (projector
  is landscape, but don't assume). No per-launch camera moves.
- **HUD** (`index.html` + `style.css`): restyled blueprint — monospace, cyan, corner-framed. Shows the
  `Mission Control` title · live ship **count** · a small **state legend** (`pad · ascending · orbit ·
  grounded`) so the room can read what each ship is doing. `LIFTOFF ✦ @callsign` **toasts** render here:
  append a toast element, auto-remove after ~3s with a CSS fade.
- **Grounded/aborted** ships get a distinct **dimmed red/amber marker** on the pad — clearly different from
  the charged/launching glow, so an ABORT reads at a glance.
- **Theme-aware:** the 3D stage is an intrinsically dark Mission Control (like the sibling). The **DOM
  chrome** (HUD, fallback roster) respects `prefers-color-scheme` via CSS custom properties so it isn't
  broken in a light context; the scene itself stays the dark projector stage.

## 7. Orbit even-spacing — `orbit.js` (pure, the named bug)

**Today** (`scene.js`): `angle = base + (rec.index / total) · 2π`, where `rec.index` is the **full-roster**
index and `total` is **all** ships — so when only a few of many ships are in orbit, they **clump**.

**Fix:** each frame the scene collects only the **orbiting** ships, orders them **stably by callsign** (so
slot assignment is deterministic and doesn't jump frame-to-frame), and assigns each an even angle via the
pure `orbitAngle(indexAmongOrbiting, orbitingCount, baseAngle)` = `baseAngle + (i / count)·2π`. When the
orbiting set changes, targets shift and ships **ease** to their new angles (§5) — the ring redistributes
smoothly. `placement.js` is untouched; it returns zone/`t`, and the **angle is the scene's job**.

**`client/orbit.test.js`:** `count` ships → `count` distinct, evenly-spaced angles (Δ = 2π/count); 1 ship;
0 ships (no throw); base-angle offset applied.

## 8. Fallbacks & dispose

- **Reduced-motion → plain roster (UNCHANGED — this stays the reduced-motion path).** `shouldUseFallback`
  is not touched: `!gl || reducedMotion` → roster. The animated scene therefore only ever runs in the
  motion-OK WebGL path, so the launch/charge/toast code needs no internal reduced-motion special-casing.
- **No-WebGL → plain roster** (unchanged).
- **Plain roster** gets the light blueprint restyle (monospace, state-colored, bigger for legibility) but
  stays **motion-free** and theme-aware; `fallback.test.js` stays green.
- **Dispose** extends the existing texture-cascade (`disposeObject3D`) to also tear down the **composer and
  its passes** (`composer.dispose()` / pass `dispose()` where available) and the grid + trail children. The
  reduced-motion `scene → fallback` swap and `pagehide` are the real callers (from M2) — they must stay leak-clean.

## 9. Dockerfile hardening (M2-deferred, folded in here)

Fold the carried M2 follow-up into this packaging-touching milestone:

```dockerfile
# --- build the client ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci                              # was: npm install
COPY vite.config.js ./
COPY client ./client
RUN npm run build                       # → /app/dist

# --- runtime ---
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev                   # only ws
COPY src ./src
COPY --from=build /app/dist ./dist
EXPOSE 3000
ENV PORT=3000
USER node                               # non-root runtime
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/ >/dev/null 2>&1 || exit 1
CMD ["node", "src/index.js"]
```

- `npm install` → **`npm ci`** in both stages (reproducible; `board/package-lock.json` is present and
  used). *(The `*` glob is dropped now that the lock file is guaranteed.)*
- **`USER node`** — the `node:20-alpine` image ships a `node` user; files copied as root stay
  world-readable, so the non-root process reads `dist/`, `src/`, and `node_modules` fine.
- **`HEALTHCHECK`** via busybox **`wget`** against `GET /` (the client is served there) — **no server
  change**, so the server suite is untouched (a `/healthz` endpoint was considered and cut as
  unnecessary scope).

## 10. Testing — light, pedagogy-first (`node --test` only)

No framework, no Playwright, no jsdom (the props ethos + the no-extra-framework rule):

- **`client/orbit.test.js`** *(new)* — the even-spacing pure function (§7). Proves the named bug is fixed.
- **`client/launch.test.js`** *(new)* — the pure launch-timing helpers: correct phase for a given elapsed,
  eased fraction monotonic in [0,1], `isComplete` at total duration.
- **`client/placement.test.js`** — unchanged; the contract mapping stays proven.
- **`scene.js`, bloom, `ship-mesh.js`** — WebGL, **untested by design**; verified by build + live smoke drive.
- The **server/room** suites (`test/*.test.js`) are **not touched** by M4 and must stay green (the board's
  full `node --test` run was 18/18 at the end of M2/M3 — M4 only adds the two new pure client tests).

## 11. Verification (drive it, don't just test it)

1. `cd board && npm test` → all pure tests green (orbit, launch, placement, room, server, fallback).
2. `npm run build` → succeeds; bundle includes the bloom passes (size sanity-check, ~+30–40KB expected).
3. Run the board (`npm start`, token unset = dev), open it, and **drive `scripts/smoke.sh`**:
   - `launch` → watch a ship **charge → thrust (+trail, LIFTOFF toast) → arc → settle** into orbit.
   - run several distinct callsigns → they **ring evenly**, not clumped.
   - `abort` → ship drops to the **grounded** red marker.
   - click an orbit ship → opens its `siteUrl`.
4. Toggle OS `prefers-reduced-motion` and simulate no-WebGL → **plain roster** both times; roster still
   updates live over ws.
5. `docker build -t shipit-board board/` → run it → `HEALTHCHECK` reports **healthy**; `docker exec … whoami`
   → **`node`**; POST via smoke.sh still lands on the board.

## 12. Non-goals (YAGNI — explicitly out)

Countdown numerals · starfield · screen-flash · per-launch camera moves (Maximal tier). Any new npm
**runtime** dependency (bloom is `three/addons`; `animejs` is out). Any change to `placement.js`, the event
contract, or the server. Roster persistence/TTL. Multi-arch GHCR publish (that is **Milestone 6**). The
launchpad ship stays serverless and beginner-simple — untouched.

## 13. Pedagogy notes

- The board is the **black box learners build + ship, never edit** — internal scene complexity is fine, but
  the **Dockerfile and run story stay clean**, because those are the surfaces S4 touches. The hardening
  (`npm ci`, `USER node`, `HEALTHCHECK`) is itself a quiet good-practice example in the artifact they deploy.
- The spectacle serves the lesson: the **launch beat** makes "green run → orbit" a thing you *watch*, and
  **even spacing + legible labels** make the shared orbit read as *60 distinct people's ships* — the
  personal-in-a-shared-world point. Polish reinforces identity; it never washes it out.
- Sensible defaults over maximal spectacle: static camera, no numerals, no new deps — the projector stays
  readable and the image stays lean for two deploy contexts (instructor + each learner's EC2).
