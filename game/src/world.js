// Foundry Yard: an original 36 x 26 m industrial yard at dusk. Two spike sites
// (A north-west behind the container stack, B north-east on the gantry platform),
// three lanes: A-long west, Mid centre through double doors, B-tunnel east.
// Every solid box is both a mesh and an AABB collider, and a bullet stop.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = { halfX: 18, halfZ: 13 };
export const SITES = {
  A: { x: -13.5, z: -9.5, r: 3.2 },
  B: { x: 13.5, z: -9.5, r: 3.2 },
};
export const PLAYER_SPAWN = { x: 0, z: 11, yaw: 0 };
export const BOT_SPAWNS = [
  { x: -12, z: -8, site: 'A' },
  { x: -9.5, z: -5.5, site: 'A' },
  { x: 12, z: -8, site: 'B' },
  { x: 0, z: 2, site: 'MID' },
];
// Patrol loops: two A holders, one B holder, one mid roamer.
export const WAYPOINTS = {
  A: [[-12, -8], [-14.5, -5], [-10, -10.5], [-12, -8]],
  A2: [[-9.5, -5.5], [-6, -8], [-11, -3], [-9.5, -5.5]],
  B: [[12, -8], [14.5, -5], [10, -10.5], [12, -8]],
  MID: [[0, 4], [3, 0], [0, -4], [-3, 0], [0, 4]],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const mats = {};
  for (const name of Object.keys(PALETTE)) {
    mats[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ember' ? 0.5 : 0.9,
      metalness: name === 'hairline' || name === 'surface' ? 0.35 : 0.05,
    });
  }
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const bb = new THREE.Box3().setFromObject(mesh);
    if (collide) colliders.push(bb);
    shootables.push(mesh);
    return mesh;
  }

  // Ground: dark slab with a painted amber centre line down Mid.
  box(36.4, 0.4, 26.4, 0, -0.2, 0, 'dark');
  box(0.5, 0.02, 20, 0, 0.02, 0, 'accent', false).material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent), roughness: 0.6, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.25,
  });

  // Perimeter walls, 4.6 m, open sky above.
  box(0.4, 4.6, 26.4, -18.2, 2.3, 0, 'surface');
  box(0.4, 4.6, 26.4, 18.2, 2.3, 0, 'surface');
  box(36.4, 4.6, 0.4, 0, 2.3, -13.2, 'surface');
  box(36.4, 4.6, 0.4, 0, 2.3, 13.2, 'surface');

  // Mid wall with double doors: the gap at x in [-1.6, 1.6], z = -2.
  box(15.6, 4.6, 0.5, -10.2, 2.3, -2, 'hairline');
  box(15.6, 4.6, 0.5, 10.2, 2.3, -2, 'hairline');
  box(3.7, 1.4, 0.5, 0, 3.9, -2, 'hairline'); // lintel over the doors
  const doorL = box(1.5, 3.2, 0.12, -1.55, 1.6, -2, 'teal');
  doorL.rotation.y = 0.5;
  const doorR = box(1.5, 3.2, 0.12, 1.55, 1.6, -2, 'teal');
  doorR.rotation.y = -0.5;

  // A-long (west lane): container stack guarding Site A + crates.
  box(6, 2.6, 2.4, -15.5, 1.3, -9.5, 'teal');
  box(6, 2.6, 2.4, -15.5, 3.9, -9.5, 'rust');
  box(2.4, 2.6, 2.4, -11, 1.3, -11.5, 'hairline');
  box(1.4, 1.1, 1.4, -13, 0.55, -5.5, 'sand');
  box(1.4, 1.1, 1.4, -14.5, 0.55, -1, 'hairline');
  box(1.2, 2.2, 1.2, -16.5, 1.1, 4, 'hairline');

  // B-tunnel (east lane): roofed corridor along the east wall, x in [14.6, 18].
  box(0.5, 4.6, 12, 14.4, 2.3, -6, 'hairline');
  box(3.6, 0.5, 12, 16.3, 4.35, -6, 'surface'); // tunnel roof
  box(1.4, 1.1, 1.4, 16.5, 0.55, -1, 'sand');
  box(1.4, 1.1, 1.4, 15.8, 0.55, -10.5, 'hairline');

  // Site B gantry platform (north-east): raised deck you step onto from the south.
  box(5.5, 0.5, 3.5, 13.5, 0.25, -10.5, 'hairline');
  box(5.5, 0.5, 0.4, 13.5, 0.75, -8.6, 'teal'); // step lip
  box(0.4, 3.4, 3.5, 16, 1.7, -10.5, 'rust'); // gantry leg wall
  box(4.5, 0.4, 0.4, 13.2, 3.6, -11.8, 'accent'); // gantry beam

  // Mid cover: furnace block, crates, pillars.
  box(2.6, 3.4, 2.6, -5, 1.7, 2, 'rust');
  box(2.6, 3.4, 2.6, 5, 1.7, 2, 'teal');
  box(1.6, 1.1, 1.6, -2.5, 0.55, 5.5, 'sand');
  box(1.6, 1.1, 1.6, 2.5, 0.55, 5.5, 'hairline');
  box(1.2, 3.6, 1.2, -8, 1.8, -6.5, 'hairline');
  box(1.2, 3.6, 1.2, 8, 1.8, -6.5, 'hairline');
  box(1.2, 1.1, 3.4, -4, 0.55, -7.5, 'hairline');
  box(1.2, 1.1, 3.4, 4, 0.55, -7.5, 'sand');
  // South spawn cover.
  box(2.4, 0.9, 1.2, -3, 0.45, 8.5, 'hairline');
  box(2.4, 0.9, 1.2, 3, 0.45, 8.5, 'hairline');
  box(1.4, 1.1, 1.4, 0, 0.55, 6.5, 'sand');

  // Furnace chimney silhouette at the north centre, outside the playable wall line.
  box(2, 7, 2, 0, 3.5, -14.5, 'dark');

  // Site decals: glowing floor rings + a letter board for each site.
  function siteDecal(site, letter) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.35, site.r, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(site.r - 0.4, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.08, side: THREE.DoubleSide }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(site.x, 0.025, site.z);
    group.add(pad);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const c = canvas.getContext('2d');
    c.fillStyle = '#1e2228';
    c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#f0a830';
    c.font = 'bold 84px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(letter, 64, 70);
    const tex = new THREE.CanvasTexture(canvas);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    board.position.set(site.x, 3.4, site.z - 2.6);
    group.add(board);
  }
  siteDecal(SITES.A, 'A');
  siteDecal(SITES.B, 'B');

  // Dusk lighting: warm low key from the west, cool fill, amber point lamps at sites.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.dusk), new THREE.Color(PALETTE.canvas), 0.9);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color(0xffb45e), 2.4);
  key.position.set(-14, 12, 8);
  key.target.position.set(0, 0, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -22;
  key.shadow.camera.right = 22;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.teal), 0.7);
  fill.position.set(12, 10, 12);
  scene.add(fill);
  for (const site of Object.values(SITES)) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 12, 12);
    lamp.position.set(site.x, 3.2, site.z);
    scene.add(lamp);
  }

  // Reused probe box for point-collision queries (bots, grenades).
  const probe = new THREE.Box3();
  function blocked(x, z, radius, y, height) {
    // Lift the probe 5 cm so the ground slab (top y = 0) is not read as a wall.
    probe.min.set(x - radius, y + 0.05, z - radius);
    probe.max.set(x + radius, y + height, z + radius);
    for (const c of colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  return { colliders, shootables, group, blocked };
}
