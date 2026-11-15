// Grenades: frag (arcing throw, bounce, radius damage) and flash (blinds bots in
// line of sight for 2 s). One small live list, reused meshes, no per-frame
// allocation. Physics: gravity + simple AABB bounce against world colliders.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const GRAVITY = 14;
const FRAG_DELAY = 1.6;
const FLASH_DELAY = 1.2;
const FRAG_RADIUS = 6.5;
const FRAG_MAX = 90;
const FLASH_RANGE = 18;
const FLASH_TIME = 2;

export function createGrenades(scene, state, world) {
  const live = [];
  const fragGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const fragMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.6, metalness: 0.3 });
  const flashMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.4, metalness: 0.4 });

  function throwGrenade(kind, origin, dir) {
    if (kind === 'frag' && state.grenades.frag <= 0) return false;
    if (kind === 'flash' && state.grenades.flash <= 0) return false;
    if (kind === 'frag') state.grenades.frag -= 1;
    else state.grenades.flash -= 1;
    const mesh = new THREE.Mesh(fragGeo, kind === 'frag' ? fragMat : flashMat);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    scene.add(mesh);
    live.push({
      kind, mesh,
      vel: new THREE.Vector3(dir.x * 11, dir.y * 11 + 3.2, dir.z * 11),
      fuse: kind === 'frag' ? FRAG_DELAY : FLASH_DELAY,
      bounced: 0,
    });
    return true;
  }

  // Returns events for main.js: { type: 'frag', pos, radius, max } or { type: 'flash', pos }.
  function step(dt, audio) {
    const events = [];
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const g = live[i];
      g.fuse -= dt;
      g.vel.y -= GRAVITY * dt;
      const p = g.mesh.position;
      const nx = p.x + g.vel.x * dt;
      const ny = p.y + g.vel.y * dt;
      const nz = p.z + g.vel.z * dt;
      let bounced = false;
      if (world.blocked(nx, nz, 0.09, ny, 0.18)) {
        // Cheap bounce: kill the horizontal component that hit, damp the rest.
        if (world.blocked(nx, p.z, 0.09, p.y, 0.18)) g.vel.x *= -0.4;
        if (world.blocked(p.x, nz, 0.09, p.y, 0.18)) g.vel.z *= -0.4;
        bounced = true;
      } else {
        p.x = nx;
        p.z = nz;
      }
      if (ny <= 0.09) {
        p.y = 0.09;
        if (Math.abs(g.vel.y) > 1.5) {
          g.vel.y *= -0.35;
          bounced = true;
        } else {
          g.vel.y = 0;
        }
      } else if (!bounced) {
        p.y = ny;
      }
      if (bounced) {
        g.bounced += 1;
        if (audio) audio.bounce();
      }
      if (g.fuse <= 0) {
        events.push({ type: g.kind, pos: p.clone(), radius: FRAG_RADIUS, max: FRAG_MAX });
        scene.remove(g.mesh);
        live.splice(i, 1);
      }
    }
    return events;
  }

  return { throwGrenade, step, live, FRAG_RADIUS, FRAG_MAX, FLASH_RANGE, FLASH_TIME };
}
