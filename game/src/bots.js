// The Wardens: four bots built from boxes and capsules, rust-red against the dusk
// yard. States: patrol (waypoint loop) / hold / engage (strafe + burst fire) /
// rotate (to a planted site) / defuse / cover (low HP). They see through a
// raycast line-of-sight + FOV cone + range check, and hear gunshots and the plant.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { BOT_SPAWNS, WAYPOINTS } from './world.js';

const BOT_HP = 100;
const BOT_SPEED = 3.1;
const BOT_ROTATE_SPEED = 3.6;
const SIGHT_RANGE = 30;
const SIGHT_FOV = 0.62; // cos of half-angle
const BURST_GAP = 0.95;
const BURST_SHOTS = 3;
const SHOT_GAP = 0.13;
const BOT_DAMAGE = 11;
const COVER_HP = 35;

const NAMES = ['Warden-1', 'Warden-2', 'Warden-3', 'Warden-4'];
const ROUTES = ['A', 'A2', 'B', 'MID'];

export function createBots(scene, state, world) {
  const rng = state.rng;
  const raycaster = new THREE.Raycaster();
  raycaster.far = SIGHT_RANGE;
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const move = new THREE.Vector3();

  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.7, metalness: 0.1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.dark), roughness: 0.8, metalness: 0.1 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent), roughness: 0.3, metalness: 0.2,
    emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.6,
  });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.72, 0.3);
  const headGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const limbGeo = new THREE.BoxGeometry(0.14, 0.62, 0.14);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);

  const bots = [];
  for (let i = 0; i < 4; i += 1) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.02;
    const head = new THREE.Mesh(headGeo, darkMat);
    head.position.y = 1.56;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.02), visorMat);
    visor.position.set(0, 1.58, 0.16);
    const armL = new THREE.Mesh(limbGeo, darkMat);
    armL.position.set(-0.34, 1.02, 0.05);
    const armR = new THREE.Mesh(limbGeo, darkMat);
    armR.position.set(0.34, 1.02, 0.05);
    const legL = new THREE.Mesh(limbGeo, darkMat);
    legL.position.set(-0.14, 0.34, 0);
    const legR = new THREE.Mesh(limbGeo, darkMat);
    legR.position.set(0.14, 0.34, 0);
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.2, 1.15, -0.3);
    group.add(torso, head, visor, armL, armR, legL, legR, gun);
    group.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    group.position.set(BOT_SPAWNS[i].x, 0, BOT_SPAWNS[i].z);
    scene.add(group);
    const bot = {
      id: i, name: NAMES[i], route: ROUTES[i], group, torso, head, armL, armR, legL, legR,
      hp: BOT_HP, alive: true, fall: 0,
      state: 'patrol', wp: 0, yaw: 0, strafeDir: 1, strafeAt: 0,
      burstLeft: 0, burstTimer: 1 + rng() * 0.5, shotTimer: 0,
      blindUntil: 0, lastSeen: -99, seenPos: new THREE.Vector3(),
      hitFlash: 0, walkPhase: 0,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    armL.userData.bot = bot;
    armL.userData.part = 'limb';
    armR.userData.bot = bot;
    armR.userData.part = 'limb';
    legL.userData.bot = bot;
    legL.userData.part = 'limb';
    legR.userData.bot = bot;
    legR.userData.part = 'limb';
    bots.push(bot);
  }
  state.bots = bots;

  function canSee(bot, px, py, pz) {
    from.set(bot.group.position.x, 1.5, bot.group.position.z);
    to.set(px, py, pz);
    dir.copy(to).sub(from);
    const dist = dir.length();
    if (dist > SIGHT_RANGE) return false;
    dir.divideScalar(dist || 1);
    fwd.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (fwd.dot(dir) < SIGHT_FOV && dist > 2.5) return false;
    raycaster.set(from, dir);
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    if (hit && hit.distance < dist - 0.4) return false;
    return true;
  }

  function moveToward(bot, tx, tz, dt, speed) {
    move.set(tx - bot.group.position.x, 0, tz - bot.group.position.z);
    const dist = move.length();
    if (dist < 0.15) return true;
    move.divideScalar(dist);
    const stepLen = Math.min(dist, speed * dt);
    const nx = bot.group.position.x + move.x * stepLen;
    const nz = bot.group.position.z + move.z * stepLen;
    if (!world.blocked(nx, nz, 0.35, 0, 1.7)) {
      bot.group.position.x = nx;
      bot.group.position.z = nz;
    } else if (!world.blocked(bot.group.position.x + move.x * stepLen, bot.group.position.z, 0.35, 0, 1.7)) {
      bot.group.position.x += move.x * stepLen;
    } else if (!world.blocked(bot.group.position.x, bot.group.position.z + move.z * stepLen, 0.35, 0, 1.7)) {
      bot.group.position.z += move.z * stepLen;
    }
    bot.yaw = Math.atan2(-move.x, -move.z);
    bot.walkPhase += dt * 9;
    return dist < 0.4;
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    bot.hitFlash = 0.12;
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.fall = 0;
      bot.state = 'dead';
      return true;
    }
    // Being shot reveals the shooter: turn and engage.
    bot.lastSeen = state.time;
    bot.seenPos.set(state.player.position.x, 0, state.player.position.z);
    if (bot.hp <= COVER_HP && bot.state === 'engage') bot.state = 'cover';
    return false;
  }

  function reset() {
    for (let i = 0; i < bots.length; i += 1) {
      const bot = bots[i];
      bot.hp = BOT_HP;
      bot.alive = true;
      bot.fall = 0;
      bot.state = 'patrol';
      bot.wp = 0;
      bot.burstLeft = 0;
      bot.burstTimer = 1 + rng() * 0.5;
      bot.blindUntil = 0;
      bot.lastSeen = -99;
      bot.group.position.set(BOT_SPAWNS[i].x, 0, BOT_SPAWNS[i].z);
      bot.group.rotation.set(0, 0, 0);
      bot.group.visible = true;
      bot.torso.material = bodyMat;
    }
  }

  // events: shots fired by bots, for main.js to resolve damage + tracers.
  function step(dt, callbacks) {
    const p = state.player;
    const px = p.position.x;
    const pz = p.position.z;
    const py = p.position.y + p.eye;
    const blind = state.time < p.flashBlind;
    for (const bot of bots) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
        continue;
      }
      bot.hitFlash = Math.max(0, bot.hitFlash - dt);
      bot.torso.material = bot.hitFlash > 0 ? visorMat : bodyMat;
      const blinded = state.time < bot.blindUntil;
      const sees = !blinded && p.alive && canSee(bot, px, py, pz);
      if (sees) {
        bot.lastSeen = state.time;
        bot.seenPos.set(px, 0, pz);
        if (bot.state !== 'defuse') bot.state = 'engage';
      }
      // Hear the latest gunshot / plant noise: nearest bots investigate.
      if (state.noise && state.time - state.noise.at < 1.2 && bot.state === 'patrol') {
        const d = Math.hypot(state.noise.x - bot.group.position.x, state.noise.z - bot.group.position.z);
        if (d < 14) {
          bot.seenPos.set(state.noise.x, 0, state.noise.z);
          bot.lastSeen = state.time;
          bot.state = 'engage';
        }
      }
      // A planted spike pulls every living bot to the site.
      if (state.spike.state === 'planted' && bot.state !== 'defuse' && bot.state !== 'engage') {
        bot.state = 'rotate';
      }

      if (bot.state === 'engage') {
        const dx = px - bot.group.position.x;
        const dz = pz - bot.group.position.z;
        const dist = Math.hypot(dx, dz);
        bot.yaw = Math.atan2(-dx, -dz);
        // Strafe sideways while fighting; break off to cover at low HP.
        if (bot.hp <= COVER_HP) {
          bot.state = 'cover';
        } else {
          if (state.time > bot.strafeAt) {
            bot.strafeDir *= -1;
            bot.strafeAt = state.time + 0.7 + rng() * 0.8;
          }
          const sx = -dz / (dist || 1) * bot.strafeDir;
          const sz = dx / (dist || 1) * bot.strafeDir;
          const nx = bot.group.position.x + sx * BOT_SPEED * 0.55 * dt;
          const nz = bot.group.position.z + sz * BOT_SPEED * 0.55 * dt;
          if (!world.blocked(nx, nz, 0.35, 0, 1.7)) {
            bot.group.position.x = nx;
            bot.group.position.z = nz;
          }
          bot.walkPhase += dt * 9;
          // Burst fire: 3 shots, then a pause. Accuracy falls with range and target speed.
          bot.burstTimer -= dt;
          if (bot.burstLeft > 0) {
            bot.shotTimer -= dt;
            if (bot.shotTimer <= 0) {
              bot.shotTimer = SHOT_GAP;
              bot.burstLeft -= 1;
              if (sees && !blind) callbacks.onBotShot(bot, dist);
            }
          } else if (bot.burstTimer <= 0 && sees) {
            bot.burstLeft = BURST_SHOTS;
            bot.burstTimer = BURST_GAP + rng() * 0.5;
            bot.shotTimer = 0;
          }
        }
        // Lost sight for a while: go back to the last seen spot, then patrol.
        if (state.time - bot.lastSeen > 4) bot.state = 'patrol';
      } else if (bot.state === 'rotate') {
        const site = state.spike.site === 'A' ? { x: -13.5, z: -9.5 } : { x: 13.5, z: -9.5 };
        const arrived = moveToward(bot, site.x, site.z, dt, BOT_ROTATE_SPEED);
        if (arrived) bot.state = 'defuse';
      } else if (bot.state === 'defuse') {
        const site = state.spike.site === 'A' ? { x: -13.5, z: -9.5 } : { x: 13.5, z: -9.5 };
        bot.yaw = Math.atan2(-(site.x - bot.group.position.x), -(site.z - bot.group.position.z));
        // Defusing is handled by sim.js (progress); the bot just kneels here.
        bot.group.position.y = -0.25;
      } else if (bot.state === 'cover') {
        // Back away from the last seen spot behind the nearest waypoint.
        const wp = WAYPOINTS[bot.route][bot.wp % WAYPOINTS[bot.route].length];
        moveToward(bot, wp[0], wp[1], dt, BOT_SPEED);
        if (bot.hp > COVER_HP + 15) bot.state = 'engage';
        if (state.time - bot.lastSeen > 5) bot.state = 'patrol';
      } else {
        // patrol / hold: walk the route loop.
        bot.group.position.y = 0;
        const wp = WAYPOINTS[bot.route][bot.wp % WAYPOINTS[bot.route].length];
        if (moveToward(bot, wp[0], wp[1], dt, BOT_SPEED)) {
          bot.wp = (bot.wp + 1) % WAYPOINTS[bot.route].length;
        }
      }
      // Walk-cycle swing, frozen while defusing.
      const swing = bot.state === 'defuse' ? 0 : Math.sin(bot.walkPhase) * 0.45;
      bot.legL.rotation.x = swing;
      bot.legR.rotation.x = -swing;
      bot.armL.rotation.x = -swing * 0.7;
      bot.armR.rotation.x = swing * 0.7;
      bot.group.rotation.y = bot.yaw;
    }
  }

  return {
    bots,
    step,
    damage,
    reset,
    canSee,
    aliveCount() {
      return bots.filter((b) => b.alive).length;
    },
    hitMeshes() {
      const meshes = [];
      for (const b of bots) meshes.push(b.torso, b.head, b.armL, b.armR, b.legL, b.legR);
      return meshes;
    },
  };
}
