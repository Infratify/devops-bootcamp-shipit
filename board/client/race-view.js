// board/client/race-view.js
import * as THREE from 'three';
import { createShip, preloadShipTemplates, disposeShip, disposeObject3D } from './ship-mesh.js';
import { trackPosition } from './track.js';
import { PALETTE } from './theme.js';

// A side-on orthographic race track. Reuses the same GLB ships as the orbit
// scene; positions them by race progress. Same { update, dispose } shape as
// createScene so main.js can swap the two freely.
export function createRaceView(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.bg);

  const aspect = container.clientWidth / Math.max(1, container.clientHeight);
  const H = 10; // half-height of the ortho frustum in world units
  const camera = new THREE.OrthographicCamera(-H * aspect, H * aspect, H, -H, 0.1, 100);
  camera.position.set(0, 3, 20); camera.lookAt(0, 3, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.8));
  const key = new THREE.DirectionalLight(PALETTE.dir, 0.9); key.position.set(2, 6, 8); scene.add(key);

  // Finish line at the right edge of the track.
  const finish = new THREE.Mesh(
    new THREE.PlaneGeometry(0.15, 16),
    new THREE.MeshBasicMaterial({ color: PALETTE.ring }),
  );
  finish.position.set(8, 3, -0.5); scene.add(finish);

  const ships = new Map(); // callsign -> { group, data }
  let templates = null;
  let pending = null;
  let disposed = false;
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();

  function laneOf(list) {
    const sorted = [...list].sort((a, b) => (a.callsign < b.callsign ? -1 : 1));
    const map = new Map();
    sorted.forEach((s, i) => map.set(s.callsign, i - (sorted.length - 1) / 2));
    return map;
  }

  function update(list) {
    if (!templates) { pending = list; return; }
    const seen = new Set();
    const lanes = laneOf(list);
    list.forEach((s) => {
      seen.add(s.callsign);
      let rec = ships.get(s.callsign);
      if (!rec || rec.data.color !== s.color || rec.data.shipModel !== s.shipModel) {
        if (rec) { scene.remove(rec.group); disposeShip(rec.group); }
        const template = templates.get(s.shipModel) || templates.get('fighter');
        const group = createShip({ callsign: s.callsign, color: s.color || '#94a3b8', shipModel: s.shipModel, template });
        group.rotation.y = Math.PI / 2; // nose down the track (+x)
        scene.add(group);
        rec = { group };
        ships.set(s.callsign, rec);
      }
      rec.data = s;
      rec.target = trackPosition(s.completed || 0, s.total || 12, lanes.get(s.callsign) || 0);
    });
    for (const [callsign, rec] of ships) {
      if (!seen.has(callsign)) { scene.remove(rec.group); disposeShip(rec.group); ships.delete(callsign); }
    }
  }

  let raf = 0;
  function frame() {
    const dt = clock.getDelta();
    const damp = 1 - Math.exp(-6 * dt);
    for (const rec of ships.values()) {
      if (!rec.target) continue;
      tmp.set(rec.target.x, 3 + rec.target.y, rec.target.z);
      rec.group.position.lerp(tmp, damp);
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  frame();

  function onResize() {
    const w = container.clientWidth, h = container.clientHeight, a = w / Math.max(1, h);
    camera.left = -H * a; camera.right = H * a; camera.top = H; camera.bottom = -H;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);
  onResize();

  preloadShipTemplates().then((t) => {
    if (disposed) return;
    templates = t;
    if (pending) { const l = pending; pending = null; update(l); }
  }).catch(() => { /* orbit view owns the fallback path */ });

  return {
    update,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      for (const rec of ships.values()) { scene.remove(rec.group); disposeShip(rec.group); }
      ships.clear();
      if (templates) for (const tpl of templates.values()) disposeObject3D(tpl);
      finish.geometry.dispose(); finish.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
