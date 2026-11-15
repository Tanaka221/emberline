// EMBERLINE — boot and the one loop: a fixed 60 Hz simulation feeding a render
// at the display's rate. main.js owns the shooting ray, damage, plant input,
// buy keys and grenade resolution; sim.js owns rounds, bots.js owns bot AI.
// ?shot=start|play|end|buy|plant with &seed=N renders a deterministic frame
// twice, freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createState, feed, BUY_TIME } from './state.js';
import { createWorld, PLAYER_SPAWN, SITES } from './world.js';
import { createRender } from './render.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS } from './weapons.js';
import { createGrenades } from './grenades.js';
import { createBots } from './bots.js';
import { createSim } from './sim.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const state = createState(seed);
const rng = state.rng;

const render = createRender();
const { scene, camera } = render;
const world = createWorld(scene);
const audio = createAudio();
const hud = createHud();
const weapons = createWeapons(camera, state);
const grenades = createGrenades(scene, state, world);
const bots = createBots(scene, state, world);
const player = createPlayer(world.colliders, state);
const input = createInput(render.renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const losRay = new THREE.Raycaster();
losRay.far = 60;
const pelletDir = new THREE.Vector3();
const pelletEnd = new THREE.Vector3();

let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
const markerHoldMs = shot ? 4000 : 90;

function shootables() {
  return world.shootables.concat(bots.hitMeshes());
}

function hasLOS(ax, ay, az, bx, by, bz) {
  tmpVec.set(ax, ay, az);
  tmpVec2.set(bx - ax, by - ay, bz - az);
  const dist = tmpVec2.length();
  if (dist < 0.01) return true;
  tmpVec2.divideScalar(dist);
  losRay.set(tmpVec, tmpVec2);
  losRay.far = dist;
  const hit = losRay.intersectObjects(world.shootables, false)[0];
  return !hit || hit.distance >= dist - 0.4;
}

function damagePlayer(amount, killerName) {
  const p = state.player;
  if (!p.alive) return;
  const absorbed = Math.min(p.armour, amount * 0.5);
  p.armour -= absorbed;
  p.health -= (amount - absorbed);
  state.damageAt = state.time;
  state.lastKiller = killerName;
  audio.hurt();
  if (p.health <= 0) {
    p.health = 0;
    p.alive = false;
    state.deaths += 1;
    state.spike.state = state.spike.state === 'planting' ? 'idle' : state.spike.state;
    feed(state, `${killerName} eliminated you`, 'bad');
    if (state.spike.state !== 'planted') {
      sim.endRound(false, 'Eliminated by the Wardens');
    } else {
      state.message = { text: 'YOU ARE DOWN — THE SPIKE IS STILL LIVE', at: state.time };
    }
  }
}

function onBotShot(bot, dist) {
  const p = state.player;
  const from = tmpVec.set(bot.group.position.x, 1.45, bot.group.position.z);
  const target = tmpVec2.set(p.position.x, p.position.y + 1.2, p.position.z);
  // Hit chance: close and still is dangerous; range, movement and crouch save you.
  const speed = player.groundSpeed();
  let chance = 0.62 - dist * 0.012 - Math.min(0.25, speed * 0.04);
  if (p.crouching) chance += 0.08;
  chance = Math.max(0.06, Math.min(0.75, chance));
  const hit = rng() < chance;
  if (hit) {
    render.addTracer(from, target, '#ff7a2f');
    damagePlayer(11, bot.name);
  } else {
    const miss = new THREE.Vector3(
      target.x + (rng() * 2 - 1) * 1.4,
      target.y + (rng() * 2 - 1) * 0.8,
      target.z + (rng() * 2 - 1) * 1.4,
    );
    render.addTracer(from, miss, '#ff7a2f');
  }
  audio.enemyShot(dist);
}

function damageBot(bot, amount, part, weaponName) {
  const killed = bots.damage(bot, amount, part);
  if (killed) {
    sim.onKill(bot.name);
    feed(state, `You ▸ ${bot.name}  [${weaponName}]`, 'good');
    hud.hitMarker(true, markerHoldMs);
    audio.hit(true);
    if (bots.aliveCount() === 0 && state.spike.state !== 'planted') {
      sim.endRound(true, 'All Wardens eliminated');
    }
  } else {
    hud.hitMarker(false, markerHoldMs);
    audio.hit(false);
  }
  return killed;
}

function shoot(spread) {
  const def = weapons.def();
  if (!weapons.takeRound()) {
    audio.dryClick();
    return false;
  }
  state.shotsFired += 1;
  state.noise = { x: state.player.position.x, z: state.player.position.z, at: state.time };
  camera.getWorldDirection(direction);
  const muzzle = tmpVec.copy(camera.position);
  let hitSomething = false;
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    const d = pelletDir.copy(direction);
    d.x += (rng() * 2 - 1) * spread;
    d.y += (rng() * 2 - 1) * spread;
    d.z += (rng() * 2 - 1) * spread;
    d.normalize();
    raycaster.set(camera.position, d);
    const hit = raycaster.intersectObjects(shootables(), false)[0];
    if (!hit) continue;
    hitSomething = true;
    render.addTracer(muzzle, hit.point, PALETTE.accent);
    const bot = hit.object.userData.bot;
    if (bot && bot.alive) {
      state.shotsHit += 1;
      const part = hit.object.userData.part;
      const mult = part === 'head' ? def.headMult : part === 'limb' ? def.limbMult : 1;
      damageBot(bot, def.damage * mult, part, def.name);
    }
  }
  if (!hitSomething) {
    pelletEnd.copy(direction).multiplyScalar(40).add(camera.position);
    render.addTracer(muzzle, pelletEnd, PALETTE.accent);
  }
  weapons.pullTrigger();
  player.recoil(def.recoil * (0.9 + rng() * 0.2), (rng() * 2 - 1) * 0.004);
  audio.shot(def.kind);
  return true;
}

const sim = createSim(state, {
  onRoundStart() {
    player.reset(PLAYER_SPAWN.x, PLAYER_SPAWN.z, PLAYER_SPAWN.yaw);
    bots.reset();
    weapons.refillRound();
    render.hideSpike();
    audio.roundStart();
  },
  onRoundEnd(result) {
    hud.showOverlay('round', { ...result, wins: state.wins, losses: state.losses });
    if (document.pointerLockElement) document.exitPointerLock();
    if (result.won) audio.win();
    else audio.lose();
  },
  onMatchEnd(result) {
    hud.showOverlay('match', { ...result, wins: state.wins, losses: state.losses });
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onMatchRestart() {
    player.reset(PLAYER_SPAWN.x, PLAYER_SPAWN.z, PLAYER_SPAWN.yaw);
    bots.reset();
    weapons.resetShop();
    state.grenades.frag = 0;
    state.grenades.flash = 0;
    render.hideSpike();
    hud.hideOverlay();
  },
  onPlantTick() {
    audio.plantBeep(false);
  },
  onPlant() {
    const site = SITES[state.spike.site];
    render.showSpike(site.x, site.z);
    state.noise = { x: site.x, z: site.z, at: state.time };
    audio.plantBeep(true);
    state.message = { text: `SPIKE PLANTED AT SITE ${state.spike.site} — HOLD THE SITE`, at: state.time };
  },
  onDetonate() {
    const site = SITES[state.spike.site];
    render.explode(new THREE.Vector3(site.x, 0.5, site.z));
    audio.explosion();
    render.hideSpike();
  },
  onDefuse() {
    audio.deny();
    render.hideSpike();
  },
});

function syncCamera() {
  const p = state.player;
  camera.position.set(p.position.x, p.position.y + p.eye, p.position.z);
  camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const p = state.player;
  const dx = point.x - p.position.x;
  const dy = point.y - (p.position.y + p.eye);
  const dz = point.z - p.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function handleKeys() {
  const keys = input.state.keys;
  if (input.consume('KeyM')) {
    state.muted = !state.muted;
    audio.setMuted(state.muted);
    state.message = { text: state.muted ? 'SOUND MUTED' : 'SOUND ON', at: state.time };
  }
  if (input.consume('KeyB') && (state.phase === 'buy' || state.phase === 'round')) {
    if (state.phase === 'buy') {
      state.buyOpen = !state.buyOpen;
    } else {
      state.message = { text: 'BUY PHASE IS OVER — FIGHT WITH WHAT YOU HAVE', at: state.time };
    }
  }
  if (state.buyOpen && state.phase === 'buy') {
    const buyKeys = { Digit1: 'pistol', Digit2: 'smg', Digit3: 'rifle', Digit4: 'shotgun', Digit5: 'frag', Digit6: 'flash' };
    for (const [code, id] of Object.entries(buyKeys)) {
      if (!input.consume(code)) continue;
      if (id === 'frag' || id === 'flash') {
        const price = id === 'frag' ? 200 : 150;
        if (state.money < price) {
          state.buyError = 'NOT ENOUGH MONEY';
          audio.deny();
        } else {
          state.money -= price;
          state.grenades[id] += 1;
          state.buyError = null;
          audio.buy();
        }
      } else {
        const result = weapons.buy(id);
        if (result === 'ok') {
          state.buyError = null;
          audio.buy();
        } else if (result === 'poor') {
          state.buyError = `NOT ENOUGH MONEY — ${WEAPONS[id].name} COSTS $${WEAPONS[id].price}`;
          audio.deny();
        } else {
          state.buyError = `${WEAPONS[id].name} ALREADY OWNED`;
        }
      }
    }
  } else if (state.phase === 'round' || state.phase === 'buy') {
    for (const id of ['pistol', 'smg', 'rifle', 'shotgun']) {
      if (input.consume(`Digit${WEAPONS[id].slot}`)) weapons.switchTo(id);
    }
  }
  if (input.consume('KeyR') && state.player.alive) {
    if (weapons.reload()) audio.reload();
  }
  if (state.phase === 'round' && state.player.alive) {
    if (input.consume('KeyG')) {
      camera.getWorldDirection(direction);
      if (grenades.throwGrenade('frag', camera.position, direction)) audio.bounce();
      else audio.deny();
    }
    if (input.consume('KeyF')) {
      camera.getWorldDirection(direction);
      if (grenades.throwGrenade('flash', camera.position, direction)) audio.bounce();
      else audio.deny();
    }
  }
  // Planting: hold E inside a site while carrying the spike.
  if (state.phase === 'round' && state.player.alive && state.player.hasSpike) {
    const site = sim.siteAt(state.player.position.x, state.player.position.z);
    if (keys.has('KeyE') && site && state.spike.state === 'idle') {
      state.spike.state = 'planting';
      state.spike.site = site;
      state.spike.progress = 0;
      state.noise = { x: state.player.position.x, z: state.player.position.z, at: state.time };
    }
    if (state.spike.state === 'planting' && player.groundSpeed() > 1) {
      state.spike.state = 'idle';
      state.spike.progress = 0;
      state.spike.site = null;
    }
  }
}

function resolveGrenadeEvents(events) {
  for (const ev of events) {
    if (ev.type === 'frag') {
      render.explode(ev.pos);
      audio.explosion();
      for (const bot of bots.bots) {
        if (!bot.alive) continue;
        const d = Math.hypot(bot.group.position.x - ev.pos.x, bot.group.position.z - ev.pos.z);
        if (d <= ev.radius) damageBot(bot, ev.max * (1 - d / ev.radius) + 10, 'torso', 'Frag');
      }
      const p = state.player;
      const pd = Math.hypot(p.position.x - ev.pos.x, p.position.z - ev.pos.z);
      if (p.alive && pd <= ev.radius) damagePlayer((ev.max * 0.6) * (1 - pd / ev.radius) + 8, 'Frag');
    } else {
      audio.flashPop();
      render.addTracer(ev.pos, ev.pos, '#ffffff');
      for (const bot of bots.bots) {
        if (!bot.alive) continue;
        const d = Math.hypot(bot.group.position.x - ev.pos.x, bot.group.position.z - ev.pos.z);
        if (d > 18) continue;
        const eye = new THREE.Vector3(bot.group.position.x, 1.5, bot.group.position.z);
        if (!hasLOS(ev.pos.x, ev.pos.y, ev.pos.z, eye.x, eye.y, eye.z)) continue;
        bot.blindUntil = state.time + 2;
      }
      const p = state.player;
      const pd = Math.hypot(p.position.x - ev.pos.x, p.position.z - ev.pos.z);
      if (p.alive && pd <= 18) {
        camera.getWorldDirection(direction);
        tmpVec.copy(ev.pos).sub(camera.position).normalize();
        if (direction.dot(tmpVec) > 0.2 && hasLOS(ev.pos.x, ev.pos.y, ev.pos.z, camera.position.x, camera.position.y, camera.position.z)) {
          p.flashBlind = state.time + 1.5;
        }
      }
    }
  }
}

function step(dt) {
  state.time += dt;
  sim.step(dt);
  if (state.phase === 'buy' || state.phase === 'round') {
    if (state.player.alive) player.step(dt, input.state.keys);
    weapons.step(dt);
    bots.step(dt, { onBotShot });
    const events = grenades.step(dt, audio);
    if (events.length) resolveGrenadeEvents(events);
  }
  if (state.phase === 'roundEnd' || state.phase === 'matchEnd') {
    bots.step(dt, { onBotShot: () => {} });
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    const blindScale = state.time < state.player.flashBlind ? 0.25 : 1;
    if (look.x || look.y) player.look(look.x * blindScale, look.y * blindScale);
    handleKeys();
    if (input.state.firing && state.player.alive && (state.phase === 'round')) {
      const def = weapons.def();
      const semiBlocked = !def.auto && prevFiring;
      if (!semiBlocked && weapons.ready()) {
        shoot(weapons.spread(player.groundSpeed(), !state.player.onGround, state.player.crouching));
      }
    }
    prevFiring = input.state.firing;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    render.step(dt, state.time);
    hud.update(state, weapons, weapons.ammo);
    input.endFrame();
  }
  render.render();
}

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (state.phase === 'matchEnd') {
    sim.restartMatch();
    input.requestLock();
    return;
  }
  if (state.phase === 'roundEnd') {
    sim.nextRound();
    input.requestLock();
    return;
  }
  if (state.phase === 'menu') {
    state.phase = 'buy';
    sim.startBuyPhase();
  }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (state.phase === 'menu') {
    hud.showOverlay('start');
  } else if ((state.phase === 'round' || state.phase === 'buy') && started) {
    hud.showOverlay('paused');
  }
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    render.step(1 / 60, state.time);
    render.render();
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  player.reset(PLAYER_SPAWN.x, PLAYER_SPAWN.z, PLAYER_SPAWN.yaw);
  bots.reset();
  weapons.refillRound();
  if (name === 'start') {
    state.phase = 'menu';
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start');
  } else if (name === 'play') {
    state.phase = 'round';
    state.round = 2;
    state.wins = 1;
    state.losses = 0;
    state.money = 1150;
    state.timer = 87;
    state.phaseTime = 13;
    weapons.buy('rifle');
    state.player.position.x = 0;
    state.player.position.z = 4;
    settle(20);
    const bot = bots.bots[3];
    for (let s = 0; s < 3; s += 1) {
      aimAt(new THREE.Vector3(bot.group.position.x, 1.2, bot.group.position.z));
      // Shot mode never renders before this loop, so the bots' matrixWorld is
      // stale (identity): raycasts would test them at the origin and miss.
      scene.updateMatrixWorld(true);
      shoot(0);
      settle(6);
    }
    hud.update(state, weapons, weapons.ammo);
  } else if (name === 'end') {
    state.phase = 'roundEnd';
    state.round = 3;
    state.wins = 2;
    state.losses = 1;
    state.money = 1450;
    state.roundResult = { text: 'ROUND WON', sub: 'All Wardens eliminated', won: true, moneyEarned: 300 };
    bots.bots[0].alive = false;
    bots.bots[0].fall = 1;
    bots.bots[0].group.rotation.x = -1.45;
    settle(10);
    aimAt(new THREE.Vector3(-5, 1.2, -6));
    hud.showOverlay('round', { ...state.roundResult, wins: state.wins, losses: state.losses });
  } else if (name === 'buy') {
    state.phase = 'buy';
    state.timer = BUY_TIME;
    state.buyOpen = true;
    state.money = 1600;
    state.player.position.x = 0;
    state.player.position.z = 6;
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.update(state, weapons, weapons.ammo);
  } else if (name === 'plant') {
    state.phase = 'round';
    state.timer = 64;
    state.phaseTime = 36;
    state.player.position.x = -13.5;
    state.player.position.z = -8.2;
    state.spike.state = 'planting';
    state.spike.site = 'A';
    state.spike.progress = 2.7;
    settle(10);
    aimAt(new THREE.Vector3(-15.5, 1.3, -9.5));
    hud.update(state, weapons, weapons.ammo);
  } else {
    state.phase = 'menu';
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start');
  }
  hud.update(state, weapons, weapons.ammo);
  paintTwiceThenReady();
}

syncCamera();
hud.update(state, weapons, weapons.ammo);
if (shot) {
  runShot(shot);
} else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
