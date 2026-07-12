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
  const CAM = new THREE.Vector3(0, 3.2, 9.5);
  const LOOK = new THREE.Vector3(0, 1.8, 0);
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
