# Choosable Ship Models + Procedural Hue Tint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single vendored rocket with a choice of 4 Quaternius CC0 low-poly spaceships (selectable via `ship.config.json`'s new `shipModel` field), and repurpose `color` to procedurally hue-shift the chosen model (and the UI accent) on both the learner site and the shared board.

**Architecture:** A small pure registry (`SHIPS` + `hueShiftFor`) is duplicated across the launchpad/board bundling boundary (the repo already duplicates `COLOR_RE` this way). The learner's `scene.js` loads the selected GLB and hue-rotates its baked texture in the fragment shader; the board preloads all 4 GLBs once and clones a per-ship copy, hue-shifted, into the orbit. `color` and `emblem` stay; `shipModel` is additive.

**Tech Stack:** Node 20 (ESM), Vite 6, Three.js (launchpad 0.x via npm; board 0.169), `GLTFLoader` addon, Node's built-in `node --test`. Models vendored into `public/` (no CDN).

## Global Constraints

- **Node 20, ESM only.** Fail loud, no swallowed errors.
- **No CDN.** Vendor all 4 `.glb` files into `launchpad/public/` and `board/client/public/`.
- **No new test framework.** Unit tests use `node --test`. **No `vitest`, no Playwright in the test script.** Visual checks are driver/preview-based (the `scripts/smoke.sh` precedent).
- **Config file:** `ship.config.json` = `{ shipName, color, shipModel, emblem }`. `shipName` non-empty ≤ 24 chars; `color` matches `/^#[0-9a-fA-F]{6}$/`; `shipModel` ∈ `fighter · interceptor · hauler · scout`; `emblem` ∈ `comet · bolt · star · ring · delta · phoenix`.
- **`shipModel` bad-value policy:** strict `validateConfig`/preflight → ABORT; lenient `toRenderParams`/board `sanitizeEvent` → default `fighter`.
- **The 4 ships (id → file):** `fighter`→`fighter.glb` · `interceptor`→`interceptor.glb` · `hauler`→`hauler.glb` · `scout`→`scout.glb`. **No per-model `baseHue`** — the four ships share one baked texture atlas, so recolouring SETS the hue absolutely (see next line), which lands on the chosen colour for any model.
- **hue math lives in the pure core** (`ship-schema.js` / `ships.js` — no `three` import): `hueOf(color) → number|null` returns the chosen colour's hue as a fraction `[0,1)`, or `null` for a greyscale/invalid colour (leave the paint). The shader mutation (`applyHueShift`) lives in the render modules (`scene.js` / `ship-mesh.js`), duplicated; it SETS every saturated texel's hue to that fraction via RGB→HSV→RGB (greys/blacks stay neutral). **NOTE:** Tasks 2 & 3 were already implemented and then corrected in commit `36ec7ce` to this absolute-set design (the launchpad code below still shows the older `baseHue`/`hueShiftFor` rotation — treat commit `36ec7ce` as the source of truth for the launchpad, and mirror `hueOf`/absolute-set in the board Tasks 4 & 5 below).
- **Spec:** `docs/specs/2026-07-14-ship-model-picker-design.md`.

---

### Task 1: Vendor the 4 GLB models + attribution

Download the four Quaternius CC0 spaceships into both `public/` locations, drop the old `rocket.glb`, and record attribution.

**Files:**
- Create: `launchpad/public/fighter.glb`, `interceptor.glb`, `hauler.glb`, `scout.glb`
- Delete: `launchpad/public/rocket.glb`
- Create: `board/client/public/fighter.glb`, `interceptor.glb`, `hauler.glb`, `scout.glb`
- Create: `launchpad/CREDITS.md`

- [ ] **Step 1: Download the 4 models into launchpad/public/**

```bash
cd /home/debian/repo/devops-bootcamp-shipit/launchpad/public
curl -fsS -o fighter.glb     "https://static.poly.pizza/e8817981-bfc4-448d-822f-5b76a5983675.glb"
curl -fsS -o interceptor.glb "https://static.poly.pizza/fb4a47c7-5453-433d-959d-0d3903b578e3.glb"
curl -fsS -o hauler.glb      "https://static.poly.pizza/9dd50f84-345d-418f-bb58-0cb63fd091e6.glb"
curl -fsS -o scout.glb       "https://static.poly.pizza/0843ab59-1800-4d96-9cc7-b4d6afbecf21.glb"
rm -f rocket.glb
```

- [ ] **Step 2: Verify all four are valid glTF-binary**

Run: `cd /home/debian/repo/devops-bootcamp-shipit/launchpad/public && file *.glb`
Expected: each line reports `glTF binary model, version 2`.

- [ ] **Step 3: Copy the same 4 into the board's public dir**

```bash
mkdir -p /home/debian/repo/devops-bootcamp-shipit/board/client/public
cp /home/debian/repo/devops-bootcamp-shipit/launchpad/public/{fighter,interceptor,hauler,scout}.glb \
   /home/debian/repo/devops-bootcamp-shipit/board/client/public/
```

- [ ] **Step 4: Write `launchpad/CREDITS.md`**

```markdown
# Credits

The four ship models are by **Quaternius**, released **CC0 1.0 (public domain)** via
[poly.pizza](https://poly.pizza). CC0 requires no attribution; this note is courtesy.

| in-app id | source |
|---|---|
| `fighter`     | https://poly.pizza/m/uCeLfsdmNP |
| `interceptor` | https://poly.pizza/m/Jqfed124pQ |
| `hauler`      | https://poly.pizza/m/VSxUAFhzbA |
| `scout`       | https://poly.pizza/m/u105mYHLHU |
```

- [ ] **Step 5: Commit**

```bash
cd /home/debian/repo/devops-bootcamp-shipit
git add launchpad/public board/client/public launchpad/CREDITS.md
git commit -m "assets: vendor 4 Quaternius CC0 ships, drop rocket.glb"
```

---

### Task 2: Launchpad config contract — registry, `hueShiftFor`, validation

Add the shared registry + hue math to the pure core, require `shipModel` in the strict gate, default it in the lenient path, and update the config + fixtures + both test files so `npm test` is green.

**Files:**
- Modify: `launchpad/src/ship-schema.js`
- Modify: `launchpad/ship.config.json`
- Modify: `launchpad/scripts/__fixtures__/valid.json`
- Create: `launchpad/scripts/__fixtures__/bad-model.json`
- Modify (replace): `launchpad/src/ship-schema.test.mjs`
- Modify: `launchpad/scripts/preflight.test.mjs`

**Interfaces:**
- Produces (from `ship-schema.js`):
  - `SHIPS: Array<{id, file, label, baseHue}>`, `SHIP_IDS: string[]`, `DEFAULT_SHIP: 'fighter'`
  - `hueShiftFor(color: string, baseHue: number) → number` (radians; `0` for greyscale/invalid)
  - `EMBLEMS`, `COLOR_RE`, `DEFAULTS: { shipName, color, shipModel, emblem }` (now includes `shipModel`)
  - `validateConfig(cfg) → { ok, errors }` (now also requires `shipModel ∈ SHIP_IDS`)
  - `toRenderParams(cfg) → { shipName, color, shipModel, emblem }` (unknown `shipModel` → `fighter`)

- [ ] **Step 1: Write the failing tests — replace `launchpad/src/ship-schema.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMBLEMS, SHIP_IDS, SHIPS, DEFAULT_SHIP, hueShiftFor,
  validateConfig, toRenderParams, DEFAULTS,
} from './ship-schema.js';

const good = { shipName: 'Nebula Runner', color: '#22d3ee', shipModel: 'fighter', emblem: 'comet' };
const approx = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('validateConfig accepts a well-formed config', () => {
  const r = validateConfig(good);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test('validateConfig rejects a bad colour', () => {
  const r = validateConfig({ ...good, color: 'blue' });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /colour|color/i);
});

test('validateConfig rejects an unknown emblem', () => {
  const r = validateConfig({ ...good, emblem: 'banana' });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /emblem/);
});

test('validateConfig rejects an unknown shipModel', () => {
  const r = validateConfig({ ...good, shipModel: 'battlecruiser' });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /shipModel|ship model/i);
});

test('validateConfig rejects a missing shipModel', () => {
  const { shipModel, ...noModel } = good;
  assert.equal(validateConfig(noModel).ok, false);
});

test('validateConfig rejects an over-long shipName', () => {
  assert.equal(validateConfig({ ...good, shipName: 'x'.repeat(25) }).ok, false);
});

test('validateConfig accepts a 24-char name padded with whitespace', () => {
  const padded = '  ' + 'x'.repeat(24) + '  ';
  assert.equal(validateConfig({ ...good, shipName: padded }).ok, true);
  assert.equal(toRenderParams({ ...good, shipName: padded }).shipName, 'x'.repeat(24));
});

test('validateConfig rejects a non-object', () => {
  assert.equal(validateConfig(null).ok, false);
  assert.equal(validateConfig([]).ok, false);
});

test('toRenderParams falls back to DEFAULTS on garbage', () => {
  assert.deepEqual(toRenderParams({ shipName: '', color: 'nope', shipModel: 'x', emblem: 'x' }), DEFAULTS);
  assert.deepEqual(toRenderParams(null), DEFAULTS);
});

test('toRenderParams keeps valid values and trims shipName', () => {
  const p = toRenderParams({ shipName: '  Comet  ', color: '#ABCDEF', shipModel: 'scout', emblem: 'bolt' });
  assert.deepEqual(p, { shipName: 'Comet', color: '#ABCDEF', shipModel: 'scout', emblem: 'bolt' });
});

test('DEFAULTS.shipModel is the default ship and is a known id', () => {
  assert.equal(DEFAULTS.shipModel, DEFAULT_SHIP);
  assert.ok(SHIP_IDS.includes(DEFAULT_SHIP));
});

test('every ship has an id, file, label and numeric baseHue', () => {
  for (const s of SHIPS) {
    assert.match(s.id, /^[a-z]+$/);
    assert.match(s.file, /\.glb$/);
    assert.equal(typeof s.label, 'string');
    assert.equal(typeof s.baseHue, 'number');
  }
});

test('hueShiftFor: greyscale or invalid colour → 0', () => {
  assert.equal(hueShiftFor('#808080', 25), 0);
  assert.equal(hueShiftFor('not-a-color', 25), 0);
});

test('hueShiftFor: same hue as baseHue → ~0', () => {
  approx(hueShiftFor('#ff0000', 0), 0);         // red hue 0, baseHue 0
});

test('hueShiftFor: cyan on the fighter rotates ~163°', () => {
  approx(hueShiftFor('#22d3ee', 25), ((188 - 25) * Math.PI) / 180, 0.02);
});

test('all EMBLEMS are lowercase words', () => {
  for (const e of EMBLEMS) assert.match(e, /^[a-z]+$/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/debian/repo/devops-bootcamp-shipit/launchpad && node --test src/ship-schema.test.mjs`
Expected: FAIL (`SHIP_IDS`/`hueShiftFor`/`DEFAULT_SHIP` not exported; `shipModel` not validated).

- [ ] **Step 3: Update `launchpad/src/ship-schema.js`**

Replace the whole file with:

```js
// Pure config core — no browser/node-only imports, so both the CLI gate
// (Node) and the site (Vite) can import it.
export const EMBLEMS = ['comet', 'bolt', 'star', 'ring', 'delta', 'phoenix'];
export const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// The choosable ships. baseHue = the model's dominant paint hue (deg), so a
// given `color` hue-shifts every ship predictably to the same target.
export const SHIPS = [
  { id: 'fighter',     file: 'fighter.glb',     label: 'Fighter',     baseHue: 25 },
  { id: 'interceptor', file: 'interceptor.glb', label: 'Interceptor', baseHue: 330 },
  { id: 'hauler',      file: 'hauler.glb',      label: 'Hauler',      baseHue: 140 },
  { id: 'scout',       file: 'scout.glb',       label: 'Scout',       baseHue: 48 },
];
export const SHIP_IDS = SHIPS.map((s) => s.id);
export const DEFAULT_SHIP = 'fighter';
export const DEFAULTS = { shipName: 'Nebula Runner', color: '#22d3ee', shipModel: DEFAULT_SHIP, emblem: 'comet' };

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Rotation (radians) to turn a model of baseHue° into the hue of `color`.
// Greyscale/invalid colour → 0 (leave the baked paint alone).
export function hueShiftFor(color, baseHue) {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(typeof color === 'string' ? color : '');
  if (!m) return 0;
  const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (sat < 0.15) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return ((h - baseHue) * Math.PI) / 180;
}

// Strict — the pre-flight gate. Returns every problem it finds.
export function validateConfig(cfg) {
  if (!isObject(cfg)) return { ok: false, errors: ['config must be a JSON object'] };
  const errors = [];
  const name = typeof cfg.shipName === 'string' ? cfg.shipName.trim() : '';
  if (name.length < 1 || name.length > 24) {
    errors.push('shipName must be a non-empty string of at most 24 characters');
  }
  if (typeof cfg.color !== 'string' || !COLOR_RE.test(cfg.color)) {
    errors.push('color must be a hex string like #22d3ee');
  }
  if (typeof cfg.shipModel !== 'string' || !SHIP_IDS.includes(cfg.shipModel)) {
    errors.push(`shipModel must be one of: ${SHIP_IDS.join(', ')}`);
  }
  if (typeof cfg.emblem !== 'string' || !EMBLEMS.includes(cfg.emblem)) {
    errors.push(`emblem must be one of: ${EMBLEMS.join(', ')}`);
  }
  return { ok: errors.length === 0, errors };
}

// Lenient — the browser. Always returns usable params so a bad config
// (which the gate would have blocked anyway) never white-screens the site.
export function toRenderParams(cfg) {
  const raw = isObject(cfg) ? cfg : {};
  const shipName =
    typeof raw.shipName === 'string' && raw.shipName.trim() ? raw.shipName.trim().slice(0, 24) : DEFAULTS.shipName;
  const color = typeof raw.color === 'string' && COLOR_RE.test(raw.color) ? raw.color : DEFAULTS.color;
  const shipModel = typeof raw.shipModel === 'string' && SHIP_IDS.includes(raw.shipModel) ? raw.shipModel : DEFAULTS.shipModel;
  const emblem = typeof raw.emblem === 'string' && EMBLEMS.includes(raw.emblem) ? raw.emblem : DEFAULTS.emblem;
  return { shipName, color, shipModel, emblem };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/debian/repo/devops-bootcamp-shipit/launchpad && node --test src/ship-schema.test.mjs`
Expected: PASS (all tests).

- [ ] **Step 5: Update the real config + preflight fixtures + preflight test**

Set `launchpad/ship.config.json` to:
```json
{
  "shipName": "Nebula Runner",
  "color": "#22d3ee",
  "shipModel": "fighter",
  "emblem": "comet"
}
```

Set `launchpad/scripts/__fixtures__/valid.json` to:
```json
{ "shipName": "Nebula Runner", "color": "#22d3ee", "shipModel": "fighter", "emblem": "comet" }
```

Create `launchpad/scripts/__fixtures__/bad-model.json`:
```json
{ "shipName": "X", "color": "#22d3ee", "shipModel": "battlecruiser", "emblem": "comet" }
```

Append this test to `launchpad/scripts/preflight.test.mjs` (before the final line if any, after the existing tests):
```js
test('exits 1 with ABORT on an unknown shipModel', () => {
  const r = run(fixture('bad-model.json'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ABORT/);
  assert.match(r.stderr, /shipModel/);
});
```

- [ ] **Step 6: Run the full launchpad test suite**

Run: `cd /home/debian/repo/devops-bootcamp-shipit/launchpad && npm test && node --test`
Expected: preflight (`npm test`) exits 0 on the now-valid config; `node --test` runs all `*.test.mjs` green.

- [ ] **Step 7: Commit**

```bash
cd /home/debian/repo/devops-bootcamp-shipit
git add launchpad/src/ship-schema.js launchpad/src/ship-schema.test.mjs \
  launchpad/ship.config.json launchpad/scripts/__fixtures__ launchpad/scripts/preflight.test.mjs
git commit -m "feat(launchpad): shipModel field + hueShiftFor in the config core"
```

---

### Task 3: Launchpad scene — load the chosen model, hue-shift, fit; update README

Swap the model-loading path in `scene.js` to load the selected GLB, hue-rotate its material(s) instead of flat-tinting, and frame it by its largest dimension. Keep the M1 spinner + error→static-fallback behaviour. Update the learner README.

**Files:**
- Modify (replace): `launchpad/src/scene.js`
- Modify: `launchpad/README.md`

**Interfaces:**
- Consumes: `SHIPS`, `hueShiftFor` from `./ship-schema.js`; `params = { shipName, color, shipModel, emblem }` from `toRenderParams`.
- Produces: `createScene(container, params, { onError }) → { dispose() }` (signature unchanged from M1).

- [ ] **Step 1: Replace `launchpad/src/scene.js`**

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SHIPS, hueShiftFor } from './ship-schema.js';

export function createScene(container, params, { onError } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 1.1, 6);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(3, 5, 4);
  scene.add(key);

  const spinner = document.createElement('div');
  spinner.className = 'loader';
  spinner.style.setProperty('--ship-color', params.color);
  container.append(spinner);

  const ship = SHIPS.find((s) => s.id === params.shipModel) || SHIPS[0];
  const hue = hueShiftFor(params.color, ship.baseHue);

  let rocket = null;
  let disposed = false;
  let raf = 0;
  const clock = new THREE.Clock();

  function onResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  window.addEventListener('resize', onResize);

  function tick() {
    const t = clock.getElapsedTime();
    if (rocket) {
      rocket.rotation.y = t * 0.5;
      rocket.position.y = Math.sin(t * 1.5) * 0.15;
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  tick();

  function teardown() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    spinner.remove();
    if (rocket) disposeObject3D(rocket);
    renderer.dispose();
    renderer.domElement.remove();
  }

  // The load is async; the scene may be disposed before it resolves. Guard both
  // callbacks so a late load neither touches a torn-down scene nor leaks the GPU
  // resources it just allocated.
  new GLTFLoader().load(
    import.meta.env.BASE_URL + ship.file,
    (gltf) => {
      spinner.remove();
      if (disposed) {
        disposeObject3D(gltf.scene);
        return;
      }
      rocket = gltf.scene;
      applyHueShift(rocket, hue);
      fitByMaxDimension(rocket, 2.8);
      scene.add(rocket);
    },
    undefined,
    (err) => {
      if (disposed) return;
      console.warn(`${ship.file} failed to load`, err);
      teardown();
      onError?.(err);
    },
  );

  return { dispose: teardown };
}

// Rotate the hue of every mesh material in the model by `radians`, in-shader,
// after the base-colour texture is sampled. Low-saturation texels (black
// cockpit, grey trim) barely move; saturated paint rotates to the target hue.
function applyHueShift(object3d, radians) {
  if (!radians) return;
  object3d.traverse((node) => {
    if (node.isMesh && node.material) {
      node.material = node.material.clone();
      node.material.onBeforeCompile = (shader) => {
        shader.uniforms.uHue = { value: radians };
        shader.fragmentShader =
          'uniform float uHue;\n' +
          shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
             {
               float a = uHue;
               mat3 m = mat3(0.299,0.587,0.114, 0.299,0.587,0.114, 0.299,0.587,0.114)
                 + cos(a)*mat3(0.701,-0.587,-0.114, -0.299,0.413,-0.114, -0.299,-0.587,0.886)
                 + sin(a)*mat3(0.168,0.330,-0.497, -0.328,0.035,0.292, 1.250,-1.050,-0.203);
               diffuseColor.rgb = clamp(m * diffuseColor.rgb, 0.0, 1.0);
             }`,
          );
      };
      node.material.needsUpdate = true;
    }
  });
}

function fitByMaxDimension(object3d, target) {
  const box = new THREE.Box3().setFromObject(object3d);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const max = Math.max(size.x, size.y, size.z);
  const scale = max > 0 ? target / max : 1;
  object3d.scale.setScalar(scale);
  object3d.position.sub(center.multiplyScalar(scale));
}

function disposeObject3D(obj) {
  obj.traverse((node) => {
    if (node.isMesh) {
      node.geometry?.dispose();
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) disposeMaterial(m);
    }
  });
}

function disposeMaterial(material) {
  if (!material) return;
  // A material owns its textures (map, normalMap, roughnessMap, …); dispose them
  // too, or the GPU handles leak. Walk its properties rather than naming each map.
  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose();
  }
  material.dispose();
}
```

- [ ] **Step 2: Build the site**

Run: `cd /home/debian/repo/devops-bootcamp-shipit/launchpad && ./node_modules/.bin/vite build`
Expected: `✓ built` with no errors; `dist/` contains the 4 `.glb` files.

- [ ] **Step 3: Visually verify each model + each hue (REQUIRED)**

Start a preview server: `cd /home/debian/repo/devops-bootcamp-shipit/launchpad && ./node_modules/.bin/vite preview --port 4173 --strictPort &`
For each of `fighter`, `interceptor`, `hauler`, `scout`: set `ship.config.json`'s `shipModel`, rebuild, load `http://localhost:4173/` in the Playwright MCP browser, and screenshot. Also set `color` to `#22d3ee` (cyan), `#ec4899` (magenta), and `#84cc16` (lime) for at least one model and screenshot each.
Expected: the correct ship renders, framed and centred; the paint hue tracks `color` while black/grey detailing stays dark. **If a rotation looks broken on a model, record it** — that model gets accent-only treatment (skip `applyHueShift` for its `shipModel`) and note it in `CREDITS.md`. Stop the server when done (`kill %1`). Delete any screenshots and the `.playwright-mcp/` dir afterward; restore `ship.config.json` to `fighter`/`#22d3ee`.

- [ ] **Step 4: Update `launchpad/README.md`**

Replace the "Customize it" JSON block and bullets with:
```json
{
  "shipName": "Nebula Runner",
  "color": "#22d3ee",
  "shipModel": "fighter",
  "emblem": "comet"
}
```
- `shipName` — up to 24 characters.
- `color` — a hex colour like `#22d3ee` (recolours your ship and its accent).
- `shipModel` — one of: `fighter`, `interceptor`, `hauler`, `scout`.
- `emblem` — one of: `comet`, `bolt`, `star`, `ring`, `delta`, `phoenix`.

(Change the intro line "a Three.js rocket you customize" → "a Three.js spaceship you customize".)

- [ ] **Step 5: Commit**

```bash
cd /home/debian/repo/devops-bootcamp-shipit
git add launchpad/src/scene.js launchpad/README.md launchpad/CREDITS.md
git commit -m "feat(launchpad): load chosen ship model, hue-shift by color"
```

---

### Task 4: Board event contract — registry + `sanitizeEvent` carries `shipModel`

Add the board's copy of the registry and thread a lenient `shipModel` through `sanitizeEvent` into the roster.

**Files:**
- Create: `board/src/ships.js`
- Modify: `board/src/room.js`
- Modify: `board/test/room.test.js`
- Modify: `board/test/server.test.js`

**Interfaces:**
- Produces (from `ships.js`): `SHIPS`, `SHIP_IDS`, `DEFAULT_SHIP`, `hueOf` — **byte-identical** to the launchpad copy's registry/helper as it stands after commit `36ec7ce` (SHIPS has NO `baseHue`; `hueOf(color) → number|null`). Verified in Step 6.
- Produces (from `room.js`): `sanitizeEvent(raw)` entry now includes `shipModel: string` (∈ `SHIP_IDS`, default `DEFAULT_SHIP`).

- [ ] **Step 1: Write the failing tests — update `board/test/room.test.js`**

Change the import line and `base`, and add 3 tests:
```js
import { sanitizeEvent, Roster, DEFAULT_COLOR } from '../src/room.js';
import { DEFAULT_SHIP } from '../src/ships.js';

const base = { callsign: 'octocat', stage: 'build', status: 'passed', color: '#22d3ee', shipModel: 'scout' };
```
Add (anywhere among the tests):
```js
test('sanitizeEvent keeps a known shipModel', () => {
  assert.equal(sanitizeEvent({ ...base, shipModel: 'hauler' }).shipModel, 'hauler');
});

test('sanitizeEvent defaults an unknown shipModel', () => {
  assert.equal(sanitizeEvent({ ...base, shipModel: 'battlecruiser' }).shipModel, DEFAULT_SHIP);
});

test('sanitizeEvent defaults a missing shipModel', () => {
  const { shipModel, ...noModel } = base;
  assert.equal(sanitizeEvent(noModel).shipModel, DEFAULT_SHIP);
});
```
(The existing `accepts a well-formed event` test now uses the `base` that includes `shipModel: 'scout'`, so its `deepEqual` still holds once `sanitizeEvent` echoes `shipModel`.)

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/debian/repo/devops-bootcamp-shipit/board && node --test test/room.test.js`
Expected: FAIL (`../src/ships.js` missing; `shipModel` not on the entry).

- [ ] **Step 3: Create `board/src/ships.js`**

Copy this VERBATIM from the current `launchpad/src/ship-schema.js` (post-`36ec7ce`) — the SHIPS registry rows (id/file/label, NO baseHue), `SHIP_IDS`, `DEFAULT_SHIP`, and `hueOf`:
```js
// Board copy of the launchpad ship registry + hue math. Keep byte-identical to
// launchpad/src/ship-schema.js's SHIPS / SHIP_IDS / DEFAULT_SHIP / hueOf.
export const SHIPS = [
  { id: 'fighter',     file: 'fighter.glb',     label: 'Fighter' },
  { id: 'interceptor', file: 'interceptor.glb', label: 'Interceptor' },
  { id: 'hauler',      file: 'hauler.glb',      label: 'Hauler' },
  { id: 'scout',       file: 'scout.glb',       label: 'Scout' },
];
export const SHIP_IDS = SHIPS.map((s) => s.id);
export const DEFAULT_SHIP = 'fighter';

// The hue of `color` as a fraction of the colour wheel [0, 1), which the ship
// shader sets on every saturated texel. Returns null for a (near-)greyscale or
// invalid colour, which leaves the baked paint untouched (greys stay grey).
export function hueOf(color) {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(typeof color === 'string' ? color : '');
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (sat < 0.15) return null;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h / 360;
}
```

- [ ] **Step 4: Update `board/src/room.js`**

Add the import at the top (after the file's opening comment):
```js
import { SHIP_IDS, DEFAULT_SHIP } from './ships.js';
```
In `sanitizeEvent`, add a `shipModel` line to the `entry` object (right after `color`):
```js
  const entry = {
    callsign,
    stage: raw.stage,
    status: raw.status,
    color: COLOR_RE.test(raw.color) ? raw.color : DEFAULT_COLOR,
    shipModel: SHIP_IDS.includes(raw.shipModel) ? raw.shipModel : DEFAULT_SHIP,
  };
```

- [ ] **Step 5: Add a roster round-trip test to `board/test/server.test.js`**

Append this test after the existing ones (before the final newline):
```js
test('POST shipModel survives into the ws roster', async () => {
  const app = createServer({ port: 0, token: null });
  const port = app.port;
  try {
    const spectator = await openClient(port);
    await nextMsg(spectator, (m) => m.t === 'roster');
    await post(port, { ...ev, shipModel: 'interceptor' });
    const roster = await nextMsg(spectator, (m) => m.t === 'roster' && m.ships.some((s) => s.callsign === 'octocat'));
    assert.equal(roster.ships.find((s) => s.callsign === 'octocat').shipModel, 'interceptor');
    spectator.close();
  } finally { await app.close(); }
});
```

- [ ] **Step 6: Verify the registry copies match, then run the board suite**

Run:
```bash
cd /home/debian/repo/devops-bootcamp-shipit
diff <(sed -n '/export function hueOf/,/^}/p' launchpad/src/ship-schema.js) \
     <(sed -n '/export function hueOf/,/^}/p' board/src/ships.js)
diff <(grep -E "id: '" launchpad/src/ship-schema.js) <(grep -E "id: '" board/src/ships.js)
cd board && node --test
```
Expected: the `diff` shows no differences in the SHIPS rows / helper signature; `node --test` is green.

- [ ] **Step 7: Commit**

```bash
cd /home/debian/repo/devops-bootcamp-shipit
git add board/src/ships.js board/src/room.js board/test/room.test.js board/test/server.test.js
git commit -m "feat(board): sanitizeEvent carries shipModel; add ship registry"
```

---

### Task 5: Board rendering — preload models, clone per ship, hue-shift in orbit

Replace the procedural rocket with a clone of the learner's chosen GLB, hue-shifted, keeping the label, trail, and launch beat. Preload the 4 models once; buffer roster updates until preload resolves; fall back to the plain list if preload fails. Handle shared-resource disposal.

**Files:**
- Modify (replace): `board/client/ship-mesh.js`
- Modify: `board/client/scene.js`
- Modify: `board/client/fallback.js`

**Interfaces:**
- Consumes: `SHIPS`, `hueOf` from `../src/ships.js` — the same file `room.js` imports (`board/src/ships.js` is the single board-side copy). It's pure ESM with no Node built-ins, so Rollup bundles it into the client at `vite build`; the relative path `../src/ships.js` resolves from `board/client/`.
- Produces (from `ship-mesh.js`): `createShip({ callsign, color, shipModel, template }) → THREE.Group` (same `userData` shape as before, now with `shipModel`: `{ callsign, color, shipModel, mat, trail, baseEmissive }`), plus unchanged `setEmissiveBoost`, `setTrail`, `setGrounded`. New: `preloadShipTemplates() → Promise<Map<id, THREE.Object3D>>`.

- [ ] **Step 1: Replace `board/client/ship-mesh.js`**

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PALETTE } from './theme.js';
import { SHIPS, hueOf } from '../src/ships.js';

// Preload every ship GLB once; return id -> template Object3D. Templates own the
// shared geometry + textures; per-ship clones own only their cloned materials.
export function preloadShipTemplates() {
  const loader = new GLTFLoader();
  return Promise.all(
    SHIPS.map((s) => loader.loadAsync(import.meta.env.BASE_URL + s.file).then((g) => [s.id, g.scene])),
  ).then((pairs) => new Map(pairs));
}

export function createShip({ callsign, color, shipModel, template }) {
  const group = new THREE.Group();
  const model = template.clone(true);
  fitByMaxDimension(model, 0.8);

  const tint = new THREE.Color(color);
  const hue = hueOf(color); // target hue fraction [0,1), or null for a greyscale colour
  let mat = null; // the model's material — the launch beat drives its emissive
  model.traverse((node) => {
    if (node.isMesh && node.material) {
      node.userData.sharedGeometry = true;      // geometry belongs to the template — never dispose it
      node.material = node.material.clone();     // per-ship material...
      node.material.userData.keepTextures = true; // ...but its map textures are shared with the template
      node.material.emissive = tint.clone();
      node.material.emissiveIntensity = 0.35;   // low glow → blooms, same as the old rocket
      applyHueShift(node.material, hue);
      if (!mat) mat = node.material;
    }
  });
  group.add(model);

  // Exhaust trail — additive so it blooms; hidden until launch.
  const trailMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.ring), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const trail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.6, 12), trailMat);
  trail.position.y = -0.55;
  trail.rotation.x = Math.PI;
  trail.visible = false;
  group.add(trail);

  const label = makeLabel(callsign);
  label.position.y = 0.72;
  group.add(label);

  group.userData = { callsign, color, shipModel, mat, trail, baseEmissive: 0.35 };
  return group;
}

export function setEmissiveBoost(group, intensity) {
  if (group.userData.mat) group.userData.mat.emissiveIntensity = intensity;
}

export function setTrail(group, on, scale = 1) {
  const { trail } = group.userData;
  trail.visible = on;
  trail.material.opacity = on ? 0.9 * scale : 0;
  trail.scale.set(1, Math.max(0.001, scale), 1);
}

export function setGrounded(group, on) {
  const { mat, baseEmissive, color } = group.userData;
  if (!mat) return;
  mat.emissive.set(on ? PALETTE.grounded : color);
  mat.emissiveIntensity = on ? 0.6 : baseEmissive;
}

// SET every saturated texel's hue to `hueFrac` ([0,1)), in-shader, after the
// base-colour texture is sampled. Setting (not rotating) lands exactly on the
// chosen colour on any model — the 4 ships share one atlas with no base hue.
// Greys/blacks (saturation ~0) stay neutral. Null hueFrac → leave the paint.
// MUST match launchpad/src/scene.js's applyHueShift verbatim.
function applyHueShift(material, hueFrac) {
  if (hueFrac == null) return;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHue = { value: hueFrac };
    shader.fragmentShader =
      `uniform float uHue;
       vec3 rgb2hsv(vec3 c) {
         vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
         vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
         vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
         float d = q.x - min(q.w, q.y);
         float e = 1.0e-10;
         return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
       }
       vec3 hsv2rgb(vec3 c) {
         vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
         vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
         return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
       }
       ` +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         {
           vec3 hsv = rgb2hsv(diffuseColor.rgb);
           hsv.x = uHue;
           diffuseColor.rgb = hsv2rgb(hsv);
         }`,
      );
  };
  material.needsUpdate = true;
}

function fitByMaxDimension(object3d, target) {
  const box = new THREE.Box3().setFromObject(object3d);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const max = Math.max(size.x, size.y, size.z);
  const scale = max > 0 ? target / max : 1;
  object3d.scale.setScalar(scale);
  object3d.position.sub(center.multiplyScalar(scale));
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

- [ ] **Step 2: Wire preload + templates + shared-resource disposal into `board/client/scene.js`**

Make these edits:

(a) Add `preloadShipTemplates` to the import from `./ship-mesh.js`:
```js
import { createShip, setEmissiveBoost, setTrail, setGrounded, preloadShipTemplates } from './ship-mesh.js';
```

(b) Just after `const ships = new Map();` add template state + a pending buffer:
```js
  let templates = null;      // id -> template Object3D, once preloaded
  let pendingList = null;    // roster that arrived before templates were ready
```

(c) In `update(list)`, guard on templates and change the re-create condition to also fire on a `shipModel` change. Replace the top of `update` down to the `createShip` call:
```js
  function update(list) {
    if (!templates) { pendingList = list; return; }   // buffer until preloaded
    const seen = new Set();
    list.forEach((s, i) => {
      seen.add(s.callsign);
      let rec = ships.get(s.callsign);
      if (!rec || rec.data.color !== s.color || rec.data.shipModel !== s.shipModel) {
        if (rec) { scene.remove(rec.group); disposeShip(rec.group); }
        const template = templates.get(s.shipModel) || templates.get('fighter');
        const group = createShip({ callsign: s.callsign, color: s.color, shipModel: s.shipModel, template });
        scene.add(group);
        rec = { group, pos: null, lastZone: undefined, launch: null };
        ships.set(s.callsign, rec);
      }
      rec.data = s; rec.index = i;
```
(Leave the rest of the `forEach` body and the `seen` cleanup unchanged, EXCEPT change the two `disposeObject3D(rec.group)` calls in `update`'s cleanup loop to `disposeShip(rec.group)`.)

(d) Kick off preload near the end of `createScene`, before `return {`:
```js
  preloadShipTemplates().then((t) => {
    templates = t;
    if (pendingList) { const l = pendingList; pendingList = null; update(l); }
  }).catch((err) => {
    console.error('ship model preload failed', err);
    onPreloadError?.(err);
  });
```
and add `onPreloadError` to the destructured options: `export function createScene(container, { onLiftoff, onPreloadError } = {}) {`.

(e) In `dispose()`, dispose the templates' shared geometry+textures once, and change per-ship disposal to `disposeShip`. Replace the `for (const rec of ships.values()) { ... }` line inside `dispose()` with:
```js
      for (const rec of ships.values()) { scene.remove(rec.group); disposeShip(rec.group); }
      if (templates) for (const tpl of templates.values()) disposeObject3D(tpl);
```

(f) Add `disposeShip` next to `disposeObject3D` at the bottom of the file. It relies on the two flags `createShip` sets on cloned-model nodes (`node.userData.sharedGeometry` and `material.userData.keepTextures`) to skip template-owned resources, and disposes everything else (the trail's geometry+material, the label sprite's material+CanvasTexture):
```js
// A ship clone shares the template's geometry + textures; disposing those would
// break sibling clones. createShip flags cloned-model nodes: node.userData
// .sharedGeometry and material.userData.keepTextures. Skip those; dispose the
// rest (the trail + the callsign label the clone uniquely owns).
function disposeShip(group) {
  group.traverse((node) => {
    if (!node.isMesh && !node.isSprite) return;
    if (node.geometry && !node.userData.sharedGeometry) node.geometry.dispose();
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    for (const m of mats) {
      if (!m) continue;
      if (!m.userData.keepTextures) {
        for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      }
      m.dispose();
    }
  });
}
```
Invariant: **never dispose geometry or textures that came from a template.** The trail mesh (own geometry+material) and the label sprite (own SpriteMaterial + CanvasTexture) carry neither flag, so they are fully disposed.

- [ ] **Step 3: Show the ship label in the fallback list — `board/client/fallback.js`**

In `createFallback`'s `update`, append the ship model label to each row (after the status span):
```js
      el.innerHTML = ships.map((s) => `
        <div class="row">
          <span class="chip" style="background:${escapeHtml(s.color)};color:${escapeHtml(s.color)}"></span>
          <span class="cs">@${escapeHtml(s.callsign)}</span>
          <span class="st st-${escapeHtml(s.status)}">${escapeHtml(s.stage)} · ${escapeHtml(s.status)}</span>
          <span class="model">${escapeHtml(s.shipModel || '')}</span>
        </div>`).join('');
```

- [ ] **Step 4: Wire the preload-failure fallback in `board/client/main.js`**

Change the `createScene` call in `makeView` to swap to the fallback list if preload fails:
```js
  const v = useFallback ? createFallback(app) : createScene(app, {
    onLiftoff: showLiftoff,
    onPreloadError: () => {
      view.dispose();
      view = createFallback(app);
      view.update(lastShips);
    },
  });
```

- [ ] **Step 5: Build the board client**

Run: `cd /home/debian/repo/devops-bootcamp-shipit/board && ./node_modules/.bin/vite build`
Expected: `✓ built`; `dist/` contains the 4 `.glb` files.

- [ ] **Step 6: Visually verify the orbit (REQUIRED)**

```bash
cd /home/debian/repo/devops-bootcamp-shipit/board && node src/index.js &
```
POST several ships with different models + colours, then drive to orbit:
```bash
P=3000
for m in fighter interceptor hauler scout; do
  curl -fsS -X POST localhost:$P/api/event -H 'content-type: application/json' \
    -d "{\"callsign\":\"cs-$m\",\"stage\":\"pad\",\"status\":\"running\",\"color\":\"#22d3ee\",\"shipModel\":\"$m\"}"
done
# push them to orbit
for m in fighter interceptor hauler scout; do
  curl -fsS -X POST localhost:$P/api/event -H 'content-type: application/json' \
    -d "{\"callsign\":\"cs-$m\",\"stage\":\"liftoff\",\"status\":\"shipped\",\"color\":\"#22d3ee\",\"shipModel\":\"$m\"}"
done
```
Load `http://localhost:3000/` in the Playwright MCP browser; screenshot. Expected: four **distinct** ship shapes in orbit, all hue-shifted cyan, each with its callsign label and the bloom halo. Then re-POST one ship with a different `color` and confirm it re-tints; remove a ship (let it drop — or restart) and confirm neighbours keep rendering (shared-resource disposal check). Stop the server (`kill %1`); clean up `.playwright-mcp/` and screenshots.

- [ ] **Step 7: Run the board test suite (no regressions)**

Run: `cd /home/debian/repo/devops-bootcamp-shipit/board && node --test`
Expected: green (the pure `orbit`/`launch`/`placement`/`room`/`server` tests are unaffected by the client render change).

- [ ] **Step 8: Commit**

```bash
cd /home/debian/repo/devops-bootcamp-shipit
git add board/client/ship-mesh.js board/client/scene.js board/client/fallback.js board/client/main.js
git commit -m "feat(board): render each learner's chosen ship model, hue-shifted"
```

---

### Task 6: Answer-key workflows send `shipModel`

Extract `shipModel` from `ship.config.json` and add it to every board event payload in the two workflows that POST (`cicd3`, `cicd4`). Additive — an un-updated fork still renders a fighter.

**Files:**
- Modify: `starter/workflows/deploy.cicd3.yml`
- Modify: `starter/workflows/deploy.cicd4.yml`

- [ ] **Step 1: In BOTH files, extend each `id: cfg` step**

Every `id: cfg` step currently reads:
```yaml
      - id: cfg
        run: echo "color=$(jq -r .color ship.config.json)" >> "$GITHUB_OUTPUT"
```
Change each to:
```yaml
      - id: cfg
        run: |
          echo "color=$(jq -r .color ship.config.json)" >> "$GITHUB_OUTPUT"
          echo "model=$(jq -r .shipModel ship.config.json)" >> "$GITHUB_OUTPUT"
```
(`cicd3` has 2 such steps; `cicd4` has 2 such steps.)

- [ ] **Step 2: In BOTH files, add `shipModel` to every event JSON payload**

Each `-d "{...}"` board POST gains `,\"shipModel\":\"${{ steps.cfg.outputs.model }}\"` immediately after the `color` field. There are 3 payloads per file (pad/running, test/failed, liftoff/shipped). Example — the pad POST becomes:
```
            -d "{\"callsign\":\"${{ github.actor }}\",\"stage\":\"pad\",\"status\":\"running\",\"color\":\"${{ steps.cfg.outputs.color }}\",\"shipModel\":\"${{ steps.cfg.outputs.model }}\"}"
```
Apply the same insertion to the `test`/`failed` and `liftoff`/`shipped` payloads in both files.

- [ ] **Step 3: Validate the YAML parses**

Run: `cd /home/debian/repo/devops-bootcamp-shipit && for f in starter/workflows/deploy.cicd3.yml starter/workflows/deploy.cicd4.yml; do python3 -c "import yaml,sys; yaml.safe_load(open('$f')); print('ok $f')"; done`
Expected: `ok` for both.

- [ ] **Step 4: Commit**

```bash
cd /home/debian/repo/devops-bootcamp-shipit
git add starter/workflows/deploy.cicd3.yml starter/workflows/deploy.cicd4.yml
git commit -m "feat(starter): answer-key workflows POST shipModel to the board"
```

---

### Task 7: Update the PINNED contracts + learner docs

Update `CLAUDE.md`'s two pinned blocks and the learner-facing docs to reflect the new config field and the model-rendering board. **Do not** edit the separate slides repo — note the drift only.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/learner-per-session-commands.md`
- Modify: `starter/README.learner.md`

- [ ] **Step 1: `CLAUDE.md` — the event contract JSON block**

In the "PINNED — pipeline ↔ board event contract" section, add `shipModel` to the example payload (after `color`) and update the surrounding bullets:
```
  "color":    "#22d3ee",          // from the learner's ship.config.json; hue-shifts the ship
  "shipModel":"fighter",          // from ship.config.json: fighter · interceptor · hauler · scout
```
Update the "Config the board needs" bullet to: `color` (hue-shift) **and** `shipModel` (which of the 4 ships the board renders in orbit) come from `ship.config.json`; `shipName` is a cosmetic label.

- [ ] **Step 2: `CLAUDE.md` — the learner-facing contract**

In "PINNED — learner-facing contract", change the config-file line to:
```
- **Config file** learners edit: `ship.config.json` → `{ shipName, color, shipModel, emblem }`.
  - `shipName` non-empty ≤ 24 chars · `color` hex `/^#[0-9a-fA-F]{6}$/` (recolours the ship via
    hue-shift) · `shipModel` ∈ `fighter · interceptor · hauler · scout` · `emblem` ∈
    `comet · bolt · star · ring · delta · phoenix`. `callsign` is the GitHub username (VITE_CALLSIGN).
```
Also update the "Ship rendering" reference elsewhere in the doc if it says "rocket" — change to "one of four low-poly spaceships (Quaternius, CC0), hue-shifted by `color`". Add a one-line note near the contract: *the slides repo (`~/repo/slides-devops-bootcamp`) quotes these verbatim and must be updated separately.*

- [ ] **Step 3: `docs/learner-per-session-commands.md` + `starter/README.learner.md`**

Where these mention editing `ship.config.json` / `color` / `emblem`, add `shipModel` (one of the 4 ids) to the customisation step. Keep it brief — one line each.

- [ ] **Step 4: Commit**

```bash
cd /home/debian/repo/devops-bootcamp-shipit
git add CLAUDE.md docs/learner-per-session-commands.md starter/README.learner.md
git commit -m "docs: pin shipModel in the config + event contracts"
```

---

## Final verification

- [ ] `cd launchpad && npm test && node --test` — green.
- [ ] `cd board && node --test` — green.
- [ ] `cd launchpad && ./node_modules/.bin/vite build` — 4 `.glb` in `dist/`.
- [ ] `cd board && ./node_modules/.bin/vite build` — 4 `.glb` in `dist/`.
- [ ] Launchpad preview shows the 4 models, hue tracking `color`; GLB-error path still shows the static card.
- [ ] Board orbit shows 4 distinct hue-shifted models with labels + bloom; removing one doesn't corrupt neighbours.
- [ ] `git grep -n "rocket.glb"` returns nothing in `launchpad/`, `board/`, `starter/`, `docs/` (only historical/spec mentions are acceptable).
