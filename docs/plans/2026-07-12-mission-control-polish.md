# Mission Control Polish (Milestone 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the plain-but-correct M2 `board/` scene into the projector spectacle — blueprint aesthetic, a watchable per-ship launch beat, evenly-ringed orbit, projector-legible labels/HUD — plus fold in the deferred Dockerfile hardening. Visual only.

**Architecture:** All work is in `board/client/` (the Three.js spectator) + `board/Dockerfile`. `scene.js` becomes an orchestrator; two bug-prone bits are extracted into **pure, `three`-free modules** (`orbit.js` even-spacing, `launch.js` launch timing) so `node --test` can cover them like the existing `placement.js`. Glow comes from `UnrealBloomPass` (bundled in `three/addons`, no new npm dep); the launch beat is hand-rolled easing in the tick loop (no `animejs`).

**Tech Stack:** Node 20 · ESM · Three.js `^0.169.0` (+ `three/addons` postprocessing) · Vite build · `node --test` (no vitest/Playwright/jsdom).

## Global Constraints

- **Do NOT change** `client/placement.js` (the pinned `(stage,status) → {zone,t}` contract) or the event contract. M4 is **visual only**. — verbatim from spec §1.
- **`orbit.js` and `launch.js` MUST import no `three` and touch no `document`/`window` at module top** (so `node --test` can import them). — spec §3.
- **No new npm runtime dependency.** Bloom is `three/addons`; `animejs` is out. — spec §2, §12.
- **Reduced-motion → plain roster is UNCHANGED** (`shouldUseFallback = !gl || reducedMotion`); the animated scene only runs in the motion-OK WebGL path. — spec §8.
- Palette to match sibling `devops-bootcamp-app`: bg `#0b1220`, cyan `#38f5c9` / `#22d3ee`, text `#7dd3fc`, monospace. — spec §4.
- Server/room suites (`test/*.test.js`) untouched; full board suite was **18/18** at baseline and must stay green (M4 only adds 2 new pure client tests). — spec §10.
- Node 20, ESM, fail loud, no CDN (three bundled by Vite). — CLAUDE.md conventions.
- Verified `three@0.169.0` in `board/node_modules`; `three/addons/*` → `examples/jsm/*` (bloom files present). Import path: `three/addons/postprocessing/EffectComposer.js`.

---

### Task 1: `theme.js` — blueprint constants (three-free)

One source of truth for palette, layout, bloom, launch timing, damping. Plain values only (hex strings / numbers) so three-free modules can import it.

**Files:**
- Create: `board/client/theme.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `PALETTE`, `LAYOUT`, `BLOOM`, `LAUNCH`, `DAMP_K` (named exports, all plain data).

- [ ] **Step 1: Create the constants module**

```js
// board/client/theme.js
// Blueprint palette + tuning knobs. PLAIN DATA ONLY — no `three`, no DOM —
// so pure modules (orbit.js, launch.js) can import it and stay node --test-able.

export const PALETTE = {
  bg: '#0b1220',          // deep navy — matches devops-bootcamp-app
  grid: '#38f5c9',        // blueprint grid line
  gridDim: '#173b46',     // blueprint grid secondary
  ring: '#22d3ee',        // orbit ring / exhaust trail (blooms)
  hemiSky: '#22d3ee',
  hemiGround: '#020617',
  dir: '#8ecbff',
  labelText: '#eaf6ff',   // callsign fill
  labelOutline: '#04121f', // callsign stroke (legibility over any tint)
  grounded: '#f0505a',    // ABORT marker
};

export const LAYOUT = {
  PAD_Y: 0, ORBIT_Y: 3.2, ORBIT_R: 2.4,
  GRID_SIZE: 16, GRID_DIV: 16,
  ASCEND_COLS: 8, ASCEND_GAP: 0.7,
};

export const BLOOM = { strength: 0.6, radius: 0.6, threshold: 0.2 };

// Launch beat durations (ms) + geometry. CROUCH_Y = anticipation dip;
// APEX_Y = thrust overshoot above ORBIT_Y before arcing into the ring.
export const LAUNCH = { CHARGE_MS: 600, THRUST_MS: 1200, ARC_MS: 1000, CROUCH_Y: 0.12, APEX_Y: 4.4 };

export const DAMP_K = 6; // ease-to-target damping rate (1/s)
```

- [ ] **Step 2: Verify it imports with no `three`/DOM**

Run: `cd board && node --input-type=module -e "import('./client/theme.js').then(m => console.log(Object.keys(m), m.LAUNCH.CHARGE_MS))"`
Expected: prints `[ 'BLOOM', 'DAMP_K', 'LAUNCH', 'LAYOUT', 'PALETTE' ] 600` with no error.

- [ ] **Step 3: Commit**

```bash
git add board/client/theme.js
git commit -m "feat(board): theme.js — blueprint palette + tuning constants (M4)"
```

---

### Task 2: `orbit.js` + test — orbit even-spacing (the named bug)

The M2 bug: orbit angle used the full-roster index, so orbiting ships clump. Fix = a pure function spacing ships among *orbiting* ships. TDD.

**Files:**
- Create: `board/client/orbit.js`
- Test: `board/client/orbit.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `orbitAngle(index, count, baseAngle = 0) → number` (radians). `index` is the ship's position **among orbiting ships** (0-based); `count` is the number of orbiting ships.

- [ ] **Step 1: Write the failing test**

```js
// board/client/orbit.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orbitAngle } from './orbit.js';

const TAU = Math.PI * 2;

test('spaces N ships evenly around the ring', () => {
  const count = 4;
  const angles = [0, 1, 2, 3].map((i) => orbitAngle(i, count, 0));
  assert.deepEqual(angles, [0, TAU / 4, TAU / 2, (3 * TAU) / 4]);
  // every adjacent gap is exactly 2π/N
  for (let i = 1; i < count; i++) {
    assert.ok(Math.abs((angles[i] - angles[i - 1]) - TAU / count) < 1e-9);
  }
});

test('applies the base-angle offset (global rotation)', () => {
  assert.ok(Math.abs(orbitAngle(1, 4, 0.5) - (0.5 + TAU / 4)) < 1e-9);
});

test('single ship sits at the base angle', () => {
  assert.equal(orbitAngle(0, 1, 0.7), 0.7);
});

test('zero orbiting ships does not divide by zero', () => {
  assert.equal(orbitAngle(0, 0, 0.7), 0.7);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd board && node --test client/orbit.test.js`
Expected: FAIL — `Cannot find module './orbit.js'`.

- [ ] **Step 3: Write the minimal implementation**

```js
// board/client/orbit.js
// Pure even-spacing for the shared orbit. `index` is the ship's position AMONG
// ORBITING ships (not the full roster) — that is the M2 clumping fix. No `three`.

export function orbitAngle(index, count, baseAngle = 0) {
  if (count <= 0) return baseAngle;
  return baseAngle + (index / count) * Math.PI * 2;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd board && node --test client/orbit.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add board/client/orbit.js board/client/orbit.test.js
git commit -m "feat(board): orbit.js — pure even-spacing among orbiting ships (M4, #5)"
```

---

### Task 3: `launch.js` + test — pure launch timing

The launch beat's *timing math* (which phase, eased fraction, is-it-done) lives in a pure module so it is testable; `scene.js` applies it to meshes. TDD.

**Files:**
- Create: `board/client/launch.js`
- Test: `board/client/launch.test.js`

**Interfaces:**
- Consumes: `LAUNCH` from `theme.js`.
- Produces: `LAUNCH_TOTAL_MS: number`; `launchPhase(elapsedMs) → { phase: 'charge'|'thrust'|'arc'|'done', f: number }` (`f` ∈ [0,1] within the phase); `isComplete(elapsedMs) → boolean`; `easeInCubic(t)`, `easeInOutCubic(t)` (both `[0,1]→[0,1]`).

- [ ] **Step 1: Write the failing test**

```js
// board/client/launch.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchPhase, isComplete, LAUNCH_TOTAL_MS, easeInCubic, easeInOutCubic } from './launch.js';
import { LAUNCH } from './theme.js';

test('total duration is the sum of the three phases', () => {
  assert.equal(LAUNCH_TOTAL_MS, LAUNCH.CHARGE_MS + LAUNCH.THRUST_MS + LAUNCH.ARC_MS);
});

test('maps elapsed time to the right phase', () => {
  assert.equal(launchPhase(0).phase, 'charge');
  assert.equal(launchPhase(LAUNCH.CHARGE_MS).phase, 'thrust');
  assert.equal(launchPhase(LAUNCH.CHARGE_MS + LAUNCH.THRUST_MS).phase, 'arc');
  assert.equal(launchPhase(LAUNCH_TOTAL_MS).phase, 'done');
  assert.equal(launchPhase(LAUNCH_TOTAL_MS + 500).phase, 'done');
});

test('phase fraction f stays within [0,1]', () => {
  for (const ms of [0, 300, LAUNCH.CHARGE_MS + 10, LAUNCH_TOTAL_MS - 1]) {
    const { f } = launchPhase(ms);
    assert.ok(f >= 0 && f <= 1, `f=${f} out of range at ${ms}ms`);
  }
});

test('isComplete flips at total duration', () => {
  assert.equal(isComplete(LAUNCH_TOTAL_MS - 1), false);
  assert.equal(isComplete(LAUNCH_TOTAL_MS), true);
});

test('easings hit the endpoints and are monotonic', () => {
  for (const ease of [easeInCubic, easeInOutCubic]) {
    assert.ok(Math.abs(ease(0)) < 1e-9);
    assert.ok(Math.abs(ease(1) - 1) < 1e-9);
    assert.ok(ease(0.25) < ease(0.75));
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd board && node --test client/launch.test.js`
Expected: FAIL — `Cannot find module './launch.js'`.

- [ ] **Step 3: Write the minimal implementation**

```js
// board/client/launch.js
// Pure launch-beat timing. No `three`, no DOM — scene.js applies these numbers
// to meshes. Phases: charge (anticipation) → thrust (ascent) → arc (into orbit).
import { LAUNCH } from './theme.js';

const { CHARGE_MS, THRUST_MS, ARC_MS } = LAUNCH;
export const LAUNCH_TOTAL_MS = CHARGE_MS + THRUST_MS + ARC_MS;

export function launchPhase(elapsedMs) {
  if (elapsedMs < CHARGE_MS) return { phase: 'charge', f: elapsedMs / CHARGE_MS };
  if (elapsedMs < CHARGE_MS + THRUST_MS) return { phase: 'thrust', f: (elapsedMs - CHARGE_MS) / THRUST_MS };
  if (elapsedMs < LAUNCH_TOTAL_MS) return { phase: 'arc', f: (elapsedMs - CHARGE_MS - THRUST_MS) / ARC_MS };
  return { phase: 'done', f: 1 };
}

export function isComplete(elapsedMs) { return elapsedMs >= LAUNCH_TOTAL_MS; }

export function easeInCubic(t) { return t * t * t; }
export function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd board && node --test client/launch.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add board/client/launch.js board/client/launch.test.js
git commit -m "feat(board): launch.js — pure launch-beat timing helpers (M4, #5)"
```

---

### Task 4: `ship-mesh.js` — emissive tint, legible label, exhaust trail

Extend the procedural ship so it glows (blooms), its callsign reads from the back of a room, and it has a hidden exhaust trail the launch beat can light. WebGL/canvas — verified by build, not unit test.

**Files:**
- Modify: `board/client/ship-mesh.js` (full rewrite of the file)

**Interfaces:**
- Consumes: `PALETTE` from `theme.js`.
- Produces (used by `scene.js` in Task 6):
  - `createShip({ callsign, color }) → THREE.Group` with `group.userData = { callsign, color, mat, trail, baseEmissive }`.
  - `setEmissiveBoost(group, intensity)` — sets `mat.emissiveIntensity`.
  - `setTrail(group, on, scale = 1)` — show/hide + length the exhaust cone.
  - `setGrounded(group, on)` — swap emissive to the ABORT red (on) or back to the ship tint (off).

- [ ] **Step 1: Rewrite `ship-mesh.js`**

```js
// board/client/ship-mesh.js
import * as THREE from 'three';
import { PALETTE } from './theme.js';

// A tiny procedural rocket + a canvas-texture callsign label, tuned for a
// bloomed projector scene. The label + trail carry textures/materials, so
// scene.js's dispose must cascade (it does — disposeObject3D traverses the group).
export function createShip({ callsign, color }) {
  const group = new THREE.Group();
  const tint = new THREE.Color(color);
  const mat = new THREE.MeshStandardMaterial({
    color: tint, metalness: 0.3, roughness: 0.45,
    emissive: tint.clone(), emissiveIntensity: 0.35, // low glow → blooms
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 16), mat);
  group.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.24, 16), mat);
  nose.position.y = 0.37;
  group.add(nose);

  // Exhaust trail — additive so it blooms; hidden until launch.
  const trailMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.ring), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const trail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.6, 12), trailMat);
  trail.position.y = -0.55;
  trail.rotation.x = Math.PI; // taper points down, away from the nose
  trail.visible = false;
  group.add(trail);

  const label = makeLabel(callsign);
  label.position.y = 0.72;
  group.add(label);

  group.userData = { callsign, color, mat, trail, baseEmissive: 0.35 };
  return group;
}

export function setEmissiveBoost(group, intensity) {
  group.userData.mat.emissiveIntensity = intensity;
}

export function setTrail(group, on, scale = 1) {
  const { trail } = group.userData;
  trail.visible = on;
  trail.material.opacity = on ? 0.9 * scale : 0;
  trail.scale.set(1, Math.max(0.001, scale), 1);
}

export function setGrounded(group, on) {
  const { mat, baseEmissive, color } = group.userData;
  mat.emissive.set(on ? PALETTE.grounded : color);
  mat.emissiveIntensity = on ? 0.6 : baseEmissive;
}

// Projector-legible: big canvas, white fill with a dark stroke so the callsign
// reads over any ship tint and over the grid.
function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const label = '@' + text.slice(0, 15);
  ctx.font = '700 52px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 10; ctx.strokeStyle = PALETTE.labelOutline;
  ctx.strokeText(label, 256, 64);
  ctx.fillStyle = PALETTE.labelText;
  ctx.fillText(label, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(1.7, 0.42, 1);
  return sprite;
}
```

- [ ] **Step 2: Verify the client still builds**

Run: `cd board && npm run build`
Expected: `✓ built in …` with no error (Vite bundles `ship-mesh.js` + `theme.js`).

- [ ] **Step 3: Commit**

```bash
git add board/client/ship-mesh.js
git commit -m "feat(board): ship-mesh — emissive tint, legible label, exhaust trail (M4, #5)"
```

---

### Task 5: `scene.js` — blueprint stage (bg · fog · grid · bloom · lighting · camera)

Swap the plain flat scene for the blueprint stage with bloom, keeping the **existing** ship positioning for now (so it builds and runs on the new stage). The movement engine + launch come in Task 6.

**Files:**
- Modify: `board/client/scene.js` (full rewrite)

**Interfaces:**
- Consumes: `createShip` (Task 4), `placement`, `PALETTE`/`LAYOUT`/`BLOOM` (Task 1). Bloom via `three/addons/postprocessing/*`.
- Produces: `createScene(container, { onLiftoff } = {}) → { update(list), dispose() }` (the `onLiftoff` option is accepted now, used in Task 6).

- [ ] **Step 1: Rewrite `scene.js` with the blueprint stage**

```js
// board/client/scene.js
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createShip } from './ship-mesh.js';
import { placement } from './placement.js';
import { PALETTE, LAYOUT, BLOOM } from './theme.js';

const { PAD_Y, ORBIT_Y, ORBIT_R, GRID_SIZE, GRID_DIV, ASCEND_COLS, ASCEND_GAP } = LAYOUT;

export function createScene(container, { onLiftoff } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.bg);
  scene.fog = new THREE.FogExp2(PALETTE.bg, 0.02);

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
  const CAM = new THREE.Vector3(0, 6.5, 10);   // eye above the ring plane so the orbit reads as an ellipse
  const LOOK = new THREE.Vector3(0, 2.2, 0);   // (tuned live in verification — eye at y=ORBIT_Y viewed the ring edge-on)
  camera.position.copy(CAM); camera.lookAt(LOOK);

  const renderer = new THREE.WebGLRenderer({ antialias: true }); // opaque — bloom needs it
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.6));
  const key = new THREE.DirectionalLight(PALETTE.dir, 0.8); key.position.set(3, 6, 4); scene.add(key);

  const grid = new THREE.GridHelper(GRID_SIZE, GRID_DIV, PALETTE.grid, PALETTE.gridDim);
  grid.material.transparent = true; grid.material.opacity = 0.3; scene.add(grid);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48),
    new THREE.MeshBasicMaterial({ color: PALETTE.bg, transparent: true, opacity: 0.55 }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.001; scene.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(ORBIT_R, 0.02, 12, 96),
    new THREE.MeshBasicMaterial({ color: PALETTE.ring })); // bright → blooms into a halo
  ring.position.y = ORBIT_Y; ring.rotation.x = Math.PI / 2; scene.add(ring);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    BLOOM.strength, BLOOM.radius, BLOOM.threshold);
  composer.addPass(bloom);
  composer.setSize(container.clientWidth, container.clientHeight);

  const ships = new Map(); // callsign -> { group, data, index }
  let angle = 0;

  function update(list) {
    const seen = new Set();
    list.forEach((s, i) => {
      seen.add(s.callsign);
      let rec = ships.get(s.callsign);
      if (!rec || rec.data.color !== s.color) {
        if (rec) { scene.remove(rec.group); disposeObject3D(rec.group); }
        const group = createShip({ callsign: s.callsign, color: s.color });
        scene.add(group);
        rec = { group };
        ships.set(s.callsign, rec);
      }
      rec.data = s; rec.index = i;
    });
    for (const [callsign, rec] of ships) {
      if (!seen.has(callsign)) { scene.remove(rec.group); disposeObject3D(rec.group); ships.delete(callsign); }
    }
  }

  // NOTE: placeholder positioning — replaced by the movement engine in Task 6.
  function place(rec, total) {
    const { zone, t } = placement(rec.data);
    if (zone === 'orbit') {
      const a = angle + (rec.index / Math.max(1, total)) * Math.PI * 2;
      rec.group.position.set(Math.cos(a) * ORBIT_R, ORBIT_Y, Math.sin(a) * ORBIT_R);
    } else {
      const col = rec.index % ASCEND_COLS, row = Math.floor(rec.index / ASCEND_COLS);
      rec.group.position.set((col - (ASCEND_COLS - 1) / 2) * ASCEND_GAP, PAD_Y + t * (ORBIT_Y - PAD_Y), row * ASCEND_GAP - 1);
    }
  }

  let raf = 0;
  const clock = new THREE.Clock();
  function tick() {
    angle += clock.getDelta() * 0.15;
    const total = ships.size;
    for (const rec of ships.values()) place(rec, total);
    composer.render();
    raf = requestAnimationFrame(tick);
  }
  tick();

  function onResize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.zoom = Math.min(1, Math.max(0.6, camera.aspect / 1.4)); // narrow-viewport safety
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h); bloom.setSize(w, h);
  }
  window.addEventListener('resize', onResize);
  onResize();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function onClick(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...ships.values()].map((r) => r.group), true);
    if (!hits.length) return;
    let o = hits[0].object;
    while (o && !o.userData.callsign) o = o.parent;
    const rec = o && ships.get(o.userData.callsign);
    if (rec && rec.data.siteUrl && placement(rec.data).zone === 'orbit') window.open(rec.data.siteUrl, '_blank', 'noopener');
  }
  renderer.domElement.addEventListener('click', onClick);

  return {
    update,
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('click', onClick);
      for (const rec of ships.values()) { scene.remove(rec.group); disposeObject3D(rec.group); }
      ships.clear();
      grid.geometry.dispose(); grid.material.dispose();
      pad.geometry.dispose(); pad.material.dispose();
      ring.geometry.dispose(); ring.material.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// Texture-cascading dispose — carried from launchpad M1. Label sprite + trail
// carry a texture/material, so this cascade is load-bearing.
function disposeObject3D(obj) {
  obj.traverse((node) => {
    if (node.isMesh || node.isSprite) {
      node.geometry?.dispose?.();
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) disposeMaterial(m);
    }
  });
}
function disposeMaterial(material) {
  if (!material) return;
  for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
  material.dispose();
}
```

- [ ] **Step 2: Build**

Run: `cd board && npm run build`
Expected: `✓ built in …`; bundle grows (~+30–40 KB from bloom passes).

- [ ] **Step 3: Eyeball the stage against a live driver**

Run (two terminals):
```bash
cd board && npm start        # terminal A (SHIPIT_TOKEN unset = dev/open)
cd board && SLEEP=1 bash scripts/smoke.sh launch   # terminal B
```
Open `http://localhost:3000`. Expected: deep-navy scene, cyan blueprint grid, a glowing orbit ring, a bloomed rocket with a crisp `@octocat` label that reaches the ring (still the old placement — that is fine here).

- [ ] **Step 4: Commit**

```bash
git add board/client/scene.js
git commit -m "feat(board): scene — blueprint stage + UnrealBloom, grid, framed camera (M4, #5)"
```

---

### Task 6: `scene.js` — movement engine (ease-to-target · even-spacing · grounded · launch beat)

Replace the placeholder `place()` with the real engine: ships **ease toward a target** each frame (no teleports); orbit slots are **evenly spaced among orbiting ships** (`orbit.js`); aborted ships get the grounded marker; a live transition into orbit plays the **launch beat** (`launch.js`) and fires `onLiftoff`. This is the milestone's core; it has two sub-deliverables (A: movement/spacing/grounded, B: launch beat), each with its own smoke check.

**Files:**
- Modify: `board/client/scene.js`

**Interfaces:**
- Consumes: `orbitAngle` (Task 2); `launchPhase`, `isComplete`, `easeInCubic`, `easeInOutCubic` (Task 3); `setEmissiveBoost`, `setTrail`, `setGrounded` (Task 4); `LAUNCH`, `DAMP_K` (Task 1); `onLiftoff` callback (from `main.js`, Task 7).
- Produces: unchanged public shape `{ update, dispose }`.

- [ ] **Step 1: Extend the imports**

Replace the import block at the top of `scene.js` with:

```js
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createShip, setEmissiveBoost, setTrail, setGrounded } from './ship-mesh.js';
import { placement } from './placement.js';
import { orbitAngle } from './orbit.js';
import { launchPhase, isComplete, easeInCubic, easeInOutCubic } from './launch.js';
import { PALETTE, LAYOUT, BLOOM, LAUNCH, DAMP_K } from './theme.js';
```

- [ ] **Step 2: Replace the ship/movement region with the engine**

Replace the **entire contiguous region** of Task 5's `scene.js` — from `const ships = new Map(); // callsign -> { group, data, index }` down through the `tick();` invocation (i.e. the old `ships`/`angle` declarations, `update()`, the placeholder `place()`, the `clock`, and `tick()`) — with the following. Everything above it (stage/composer setup) and below it (`onResize`, click, `dispose`) is unchanged:

```js
  const ships = new Map(); // callsign -> { group, data, index, pos, lastZone, launch }
  let angle = 0;
  let elapsedMs = 0;
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();

  function update(list) {
    const seen = new Set();
    list.forEach((s, i) => {
      seen.add(s.callsign);
      let rec = ships.get(s.callsign);
      if (!rec || rec.data.color !== s.color) {
        if (rec) { scene.remove(rec.group); disposeObject3D(rec.group); }
        const group = createShip({ callsign: s.callsign, color: s.color });
        scene.add(group);
        rec = { group, pos: null, lastZone: undefined, launch: null };
        ships.set(s.callsign, rec);
      }
      rec.data = s; rec.index = i;

      const zone = placement(s).zone;
      if (zone !== rec.lastZone) setGrounded(rec.group, zone === 'grounded');
      // Launch ONLY on a live observed transition into orbit (rec.pos set = we
      // saw it before). A ship first seen already in orbit snaps in (pos===null).
      if (rec.pos && rec.lastZone && rec.lastZone !== 'orbit' && zone === 'orbit' && !rec.launch) {
        rec.launch = { startMs: elapsedMs, from: rec.pos.clone(), toasted: false };
      }
      // Abort mid-launch → cancel the beat.
      if (rec.launch && zone === 'grounded') {
        rec.launch = null; setTrail(rec.group, false); setEmissiveBoost(rec.group, rec.group.userData.baseEmissive);
      }
      rec.lastZone = zone;
    });
    for (const [callsign, rec] of ships) {
      if (!seen.has(callsign)) { scene.remove(rec.group); disposeObject3D(rec.group); ships.delete(callsign); }
    }
  }

  // Orbiting ships, ordered stably by callsign → deterministic even-spacing slots.
  function orbitingIndex() {
    const orbiting = [...ships.values()]
      .filter((r) => placement(r.data).zone === 'orbit')
      .sort((a, b) => (a.data.callsign < b.data.callsign ? -1 : 1));
    const map = new Map();
    orbiting.forEach((r, i) => map.set(r.data.callsign, i));
    return { map, count: orbiting.length };
  }

  function targetFor(rec, orbitIdx, orbitingCount, out) {
    const { zone, t } = placement(rec.data);
    if (zone === 'orbit') {
      const a = orbitAngle(orbitIdx, orbitingCount, angle);
      return out.set(Math.cos(a) * ORBIT_R, ORBIT_Y, Math.sin(a) * ORBIT_R);
    }
    const col = rec.index % ASCEND_COLS, row = Math.floor(rec.index / ASCEND_COLS);
    const x = (col - (ASCEND_COLS - 1) / 2) * ASCEND_GAP, z = row * ASCEND_GAP - 1;
    if (zone === 'grounded') return out.set(x, PAD_Y + 0.15, z);
    return out.set(x, PAD_Y + t * (ORBIT_Y - PAD_Y), z);
  }

  // The launch beat: charge (dip + glow + ignite) → thrust (rise past orbit) →
  // arc (over into the orbit slot). `slot` is the ship's even-spaced orbit target.
  function applyLaunch(rec, slot) {
    const le = elapsedMs - rec.launch.startMs;
    const ph = launchPhase(le);
    const from = rec.launch.from;
    const base = rec.group.userData.baseEmissive;
    if (ph.phase === 'charge') {
      rec.pos.set(from.x, from.y - LAUNCH.CROUCH_Y * Math.sin(ph.f * Math.PI), from.z);
      setEmissiveBoost(rec.group, base + ph.f * 1.2);
      setTrail(rec.group, true, 0.3 + ph.f * 0.4);
    } else if (ph.phase === 'thrust') {
      if (!rec.launch.toasted) { onLiftoff?.(rec.data.callsign, rec.data.color); rec.launch.toasted = true; }
      rec.pos.set(from.x, from.y + (LAUNCH.APEX_Y - from.y) * easeInCubic(ph.f), from.z);
      setEmissiveBoost(rec.group, base + 1.4);
      setTrail(rec.group, true, 1);
    } else if (ph.phase === 'arc') {
      const e = easeInOutCubic(ph.f);
      rec.pos.set(
        from.x + (slot.x - from.x) * e,
        LAUNCH.APEX_Y + (slot.y - LAUNCH.APEX_Y) * e,
        from.z + (slot.z - from.z) * e,
      );
      setEmissiveBoost(rec.group, base + (1 - ph.f) * 1.4);
      setTrail(rec.group, true, 1 - ph.f);
    }
    if (isComplete(le)) { rec.launch = null; setTrail(rec.group, false); setEmissiveBoost(rec.group, base); }
  }

  let raf = 0;
  function tick() {
    const dt = clock.getDelta();
    elapsedMs += dt * 1000;
    angle += dt * 0.15;
    camera.position.set(CAM.x + Math.sin(elapsedMs * 0.00005) * 0.35, CAM.y, CAM.z); // slow idle drift
    camera.lookAt(LOOK);

    const { map, count } = orbitingIndex();
    const damp = 1 - Math.exp(-DAMP_K * dt);
    for (const rec of ships.values()) {
      targetFor(rec, map.get(rec.data.callsign) ?? 0, count, tmp);
      if (!rec.pos) rec.pos = tmp.clone();          // snap on first sight
      else if (rec.launch) applyLaunch(rec, tmp);   // scripted beat overrides damping
      else rec.pos.lerp(tmp, damp);                 // ease toward target — no teleports
      rec.group.position.copy(rec.pos);
    }
    composer.render();
    raf = requestAnimationFrame(tick);
  }
  tick();
```

- [ ] **Step 3: Build**

Run: `cd board && npm run build`
Expected: `✓ built in …`, no errors.

- [ ] **Step 4: Verify even-spacing + grounded (sub-deliverable A)**

Run `npm start`, then drive several distinct callsigns to orbit and one abort:
```bash
cd board && SLEEP=0.6 bash scripts/smoke.sh all      # octocat→orbit, mayday→abort, intruder auth
# then add more orbiters to see even spacing:
for cs in alfa bravo charlie delta; do
  curl -s -XPOST localhost:3000/api/event -H 'content-type: application/json' \
    -d "{\"callsign\":\"$cs\",\"stage\":\"liftoff\",\"status\":\"shipped\",\"color\":\"#22d3ee\",\"siteUrl\":\"https://example.com\"}" >/dev/null
done
```
Expected in the browser: orbiting ships are **evenly ringed** (not clumped); `mayday` sits on the pad as a **dimmed red** grounded marker; ships glide (never teleport) when states change.

- [ ] **Step 5: Verify the launch beat (sub-deliverable B)**

Restart the board (clean roster), then drive a single slow launch:
```bash
cd board && SLEEP=1.2 bash scripts/smoke.sh launch
```
Expected: the ship **dips (charge) → thrusts up past the ring with a glowing trail → arcs over and settles** into its orbit slot — a watchable ~2.8s beat. (The HUD `LIFTOFF` toast lands in Task 7; `onLiftoff` is already firing.)

- [ ] **Step 6: Commit**

```bash
git add board/client/scene.js
git commit -m "feat(board): scene — ease-to-target, orbit even-spacing, grounded, launch beat (M4, #5)"
```

---

### Task 7: HUD + toast + `main.js` wiring — blueprint chrome, state legend, LIFTOFF toast, theme-aware

Restyle the DOM chrome to the blueprint look, add a state legend and the `LIFTOFF ✦ @callsign` toast, set the body background, and make the chrome theme-aware. Wire `scene`'s `onLiftoff` to the toast in `main.js`.

**Files:**
- Modify: `board/client/index.html`
- Modify: `board/client/style.css`
- Modify: `board/client/main.js`

**Interfaces:**
- Consumes: `createScene(container, { onLiftoff })` (Task 5/6).
- Produces: nothing downstream.

- [ ] **Step 1: Update `index.html` (HUD + legend + toast host)**

Replace the `<body>` contents with:

```html
  <body>
    <div id="hud">
      <h1>Mission&nbsp;Control</h1>
      <div class="count" id="count">0 ships</div>
      <ul class="legend" aria-hidden="true">
        <li><span class="dot pad"></span>pad</li>
        <li><span class="dot asc"></span>ascending</li>
        <li><span class="dot orb"></span>orbit</li>
        <li><span class="dot gnd"></span>grounded</li>
      </ul>
    </div>
    <div id="toasts" aria-live="polite"></div>
    <div id="app"></div>
    <script type="module" src="./main.js"></script>
  </body>
```

- [ ] **Step 2: Replace `style.css` (blueprint chrome, theme-aware, motion-safe toast)**

```css
:root {
  --bg: #0b1220; --cyan: #38f5c9; --cyan2: #22d3ee; --text: #7dd3fc;
  --panel: rgba(11, 18, 32, 0.55); --line: rgba(56, 245, 201, 0.35);
  --mono: ui-monospace, Menlo, Consolas, monospace;
}
/* DOM chrome is theme-aware; the 3D stage stays a dark projector scene. */
@media (prefers-color-scheme: light) {
  :root { --panel: rgba(255, 255, 255, 0.7); --text: #0b3a5b; --line: rgba(8, 58, 91, 0.3); }
}
html, body { margin: 0; height: 100%; background: var(--bg); overflow: hidden; font-family: var(--mono); color: var(--text); }
#app { position: fixed; inset: 0; }

#hud {
  position: fixed; top: 14px; left: 16px; z-index: 2;
  padding: 12px 16px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--panel); backdrop-filter: blur(6px);
}
#hud h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--cyan); }
#hud .count { opacity: .8; font-size: 14px; margin-top: 2px; }
#hud .legend { list-style: none; margin: 10px 0 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 3px 14px; font-size: 12px; opacity: .85; }
#hud .legend li { display: flex; align-items: center; gap: 7px; }
#hud .legend .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.legend .pad { background: #64748b; }
.legend .asc { background: var(--cyan2); }
.legend .orb { background: var(--cyan); box-shadow: 0 0 6px var(--cyan); }
.legend .gnd { background: #f0505a; }

/* LIFTOFF toasts — corner stack; reduced-motion users never see the scene, but
   guard anyway so the transition degrades to an instant show/hide. */
#toasts { position: fixed; top: 14px; right: 16px; z-index: 3; display: grid; gap: 8px; justify-items: end; }
.toast {
  font-size: 15px; font-weight: 700; letter-spacing: 1px; color: var(--cyan);
  padding: 8px 14px; border: 1px solid var(--line); border-radius: 6px;
  background: var(--panel); backdrop-filter: blur(6px);
  opacity: 0; transform: translateY(-6px); transition: opacity .3s ease, transform .3s ease;
}
.toast.show { opacity: 1; transform: translateY(0); }
@media (prefers-reduced-motion: reduce) { .toast { transition: none; } }

/* plain-list fallback (no-WebGL / reduced-motion) — restyled, still motion-free */
.roster { position: fixed; inset: 120px 16px 16px; overflow: auto; display: grid; gap: 6px; align-content: start; }
.roster .row { display: flex; align-items: center; gap: 10px; font-size: 16px; padding: 4px 8px; border-left: 2px solid var(--line); }
.roster .chip { width: 14px; height: 14px; border-radius: 3px; display: inline-block; box-shadow: 0 0 6px currentColor; }
.roster .cs { font-weight: 700; }
.roster .st { opacity: .8; }
.roster .st-passed, .roster .st-shipped { color: var(--cyan); }
.roster .st-failed, .roster .st-aborted { color: #f0505a; }
```

- [ ] **Step 3: Wire the toast in `main.js`**

Replace `main.js` with (adds `#toasts` handling + passes `onLiftoff` to the scene; ws/bootstrap unchanged):

```js
import './style.css';
import { createScene } from './scene.js';
import { createFallback, detectWebGL, shouldUseFallback } from './fallback.js';

const app = document.getElementById('app');
const count = document.getElementById('count');
const toasts = document.getElementById('toasts');
const gl = detectWebGL();
const mql = window.matchMedia('(prefers-reduced-motion: reduce)');

let lastShips = [];
let view = makeView(shouldUseFallback({ gl, reducedMotion: mql.matches }));

function showLiftoff(callsign) {
  if (!toasts) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = `LIFTOFF ✦ @${callsign}`;
  toasts.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3000);
}

function makeView(useFallback) {
  const v = useFallback ? createFallback(app) : createScene(app, { onLiftoff: showLiftoff });
  v.update(lastShips);
  return v;
}

mql.addEventListener('change', (e) => {
  view.dispose();
  view = makeView(shouldUseFallback({ gl, reducedMotion: e.matches }));
});
window.addEventListener('pagehide', () => view.dispose());

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'roster' && Array.isArray(m.ships)) {
      lastShips = m.ships;
      view.update(lastShips);
      if (count) count.textContent = `${lastShips.length} ship${lastShips.length === 1 ? '' : 's'}`;
    }
  };
  ws.onclose = () => setTimeout(connect, 1000);
  ws.onerror = () => ws.close();
}
connect();
```

- [ ] **Step 4: Build + verify the HUD and toast**

Run: `cd board && npm run build && npm start`, then `SLEEP=1.2 bash scripts/smoke.sh launch` in another terminal.
Expected: blueprint HUD panel (uppercase cyan title, ship count, 4-item legend); a `LIFTOFF ✦ @octocat` toast slides in top-right at thrust and auto-dismisses; the ring stays legible.

- [ ] **Step 5: Commit**

```bash
git add board/client/index.html board/client/style.css board/client/main.js
git commit -m "feat(board): blueprint HUD + state legend + LIFTOFF toast, theme-aware chrome (M4, #5)"
```

---

### Task 8: `fallback.js` — plain-roster blueprint restyle (motion-free)

Give the reduced-motion / no-WebGL roster the same blueprint feel and add per-status colouring, staying motion-free and keeping `escapeHtml`. `fallback.test.js` must stay green.

**Files:**
- Modify: `board/client/fallback.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: unchanged `{ update, dispose }` and exported `escapeHtml`, `detectWebGL`, `shouldUseFallback` (signatures untouched — the existing tests depend on them).

- [ ] **Step 1: Update the `update()` row markup (add a status class)**

In `createFallback`, replace the `update(ships)` template so each status span carries a class (the CSS from Task 7 colours it). Everything else in the file is unchanged:

```js
    update(ships) {
      el.innerHTML = ships.map((s) => `
        <div class="row">
          <span class="chip" style="background:${escapeHtml(s.color)};color:${escapeHtml(s.color)}"></span>
          <span class="cs">@${escapeHtml(s.callsign)}</span>
          <span class="st st-${escapeHtml(s.status)}">${escapeHtml(s.stage)} · ${escapeHtml(s.status)}</span>
        </div>`).join('');
    },
```

- [ ] **Step 2: Run the fallback tests (must stay green)**

Run: `cd board && node --test client/fallback.test.js`
Expected: PASS (the tested `escapeHtml` / `shouldUseFallback` are unchanged).

- [ ] **Step 3: Build + eyeball the fallback**

Run: `cd board && npm run build && npm start`. In the browser devtools, emulate `prefers-reduced-motion: reduce` (or run with a no-WebGL browser flag) and drive `scripts/smoke.sh`.
Expected: a live plain roster — monospace rows, glowing colour chips, `passed/shipped` in cyan and `failed/aborted` in red — updating over ws, no animation.

- [ ] **Step 4: Commit**

```bash
git add board/client/fallback.js
git commit -m "feat(board): fallback roster — blueprint restyle + per-status colour (M4, #5)"
```

---

### Task 9: `Dockerfile` — hardening (`npm ci` · `USER node` · `HEALTHCHECK`)

Fold the M2-deferred hardening into this packaging-touching milestone. No server change (healthcheck hits `GET /`).

**Files:**
- Modify: `board/Dockerfile`

**Interfaces:** none (build/runtime only).

- [ ] **Step 1: Rewrite `Dockerfile`**

```dockerfile
# --- build the client ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
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
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/ >/dev/null 2>&1 || exit 1
CMD ["node", "src/index.js"]
```

- [ ] **Step 2: Build the image**

Run: `docker build -t shipit-board board/`
Expected: build succeeds; both `npm ci` steps run against `board/package-lock.json`.

- [ ] **Step 3: Run it and verify hardening + health**

```bash
docker run -d --name mc -p 3000:3000 shipit-board
sleep 8
docker exec mc whoami                       # → node
docker inspect --format '{{.State.Health.Status}}' mc   # → healthy
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/ # → 200
docker rm -f mc
```
Expected: `node`, `healthy`, `200`.

- [ ] **Step 4: Commit**

```bash
git add board/Dockerfile
git commit -m "feat(board): Dockerfile hardening — npm ci, USER node, HEALTHCHECK (M4, #5)"
```

---

### Task 10: End-to-end verification + close-out

Run the full spec §11 gate against the finished board, then update the milestone status. No new code.

**Files:**
- (verification only; optional docs touch)

- [ ] **Step 1: Full test suite green**

Run: `cd board && npm test`
Expected: `pass 27` (baseline 18 + orbit 4 + launch 5), `fail 0`. If the count differs, reconcile before proceeding.

- [ ] **Step 2: Build sanity**

Run: `cd board && npm run build`
Expected: `✓ built in …`; note the bundle size (bloom included).

- [ ] **Step 3: Live drive — the whole story**

Run `npm start`, then in another terminal `SLEEP=1 bash scripts/smoke.sh all` and the extra orbiters from Task 6 Step 4. Confirm, watching `http://localhost:3000`:
  - launch beat plays (charge → thrust+trail+toast → arc → settle);
  - multiple orbiters ring **evenly**;
  - abort → **grounded** red marker;
  - click an orbit ship → opens its `siteUrl`.

- [ ] **Step 4: Fallback paths**

Toggle `prefers-reduced-motion: reduce` and (separately) a no-WebGL context → **plain roster** both times, still updating live over ws. Toggle back → scene returns, no console errors (dispose is clean).

- [ ] **Step 5: Docker path**

Repeat Task 9 Step 3 (build → run → `whoami`=node, health=healthy, POST via smoke lands on the board).

- [ ] **Step 6: Update milestone status + open the PR**

Update `MEMORY.md` / the milestone-status memory to mark M4 done, then:
```bash
git push -u origin feat/m4-mission-control-polish
gh pr create --title "Milestone 4: Mission Control polish (#5)" \
  --body "Closes #5. Blueprint aesthetic (bloom, grid, monospace HUD), per-ship launch beat, orbit even-spacing fix (pure orbit.js), projector legibility, solid fallbacks, Dockerfile hardening. Visual-only — placement() and the event contract unchanged."
```

---

## Self-Review

**Spec coverage** (each spec section → task):
- §2 Hybrid render / focused beat → Tasks 5 (bloom), 6 (hand-rolled beat). ✓
- §3 Module structure (theme/orbit/launch/ship-mesh/scene, three-free constraint) → Tasks 1–6; constraint verified in Task 1 Step 2 + enforced by the tests importing them. ✓
- §4 Blueprint aesthetic (bg/fog/grid/bloom/emissive/lighting) → Tasks 4, 5. ✓
- §5 Launch state machine (ease-to-target, live-transition trigger, phases, abort, trail) → Task 6. ✓
- §6 Projector legibility + HUD (labels, static camera, legend, toast, grounded, theme-aware) → Tasks 4 (label), 5 (camera), 7 (HUD/toast/theme). ✓
- §7 Orbit even-spacing (pure `orbit.js` + test) → Task 2; wired in Task 6. ✓
- §8 Fallbacks + dispose (roster path unchanged, composer/grid/trail disposed) → Tasks 5 (dispose), 8 (roster). ✓
- §9 Dockerfile hardening → Task 9. ✓
- §10 Testing (orbit + launch pure tests, suites green) → Tasks 2, 3, 10. ✓
- §11 Verification → Task 10. ✓
- §12 Non-goals — nothing in the plan adds numerals/starfield/camera-moves/deps. ✓

**Placeholder scan:** no TBD/TODO/"handle edge cases"; the one `// NOTE: placeholder positioning` in Task 5 is explicitly replaced in Task 6 (called out in both). All code steps show full code. ✓

**Type/name consistency:** `createScene(container, { onLiftoff })` (Tasks 5/6/7); `onLiftoff(callsign, color)` fired in Task 6, consumed as `showLiftoff(callsign)` in Task 7 (extra `color` arg ignored — intentional, kept for future use); ship-mesh helpers `setEmissiveBoost`/`setTrail`/`setGrounded` defined in Task 4, used in Task 6; `orbitAngle`/`launchPhase`/`isComplete`/`easeInCubic`/`easeInOutCubic` defined Tasks 2/3, imported Task 6; `theme.js` exports `PALETTE/LAYOUT/BLOOM/LAUNCH/DAMP_K` used consistently. ✓
