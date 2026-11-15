// Weapon defs and the weapon state machine: fire gap, reload, spread and recoil.
// Damage is applied by main.js (raycast + body part); this module owns the numbers
// and the view models. Spread: still ~0.002, moving up to ~0.03, airborne worse,
// crouch cuts 40%; bloom grows while firing and decays at rest.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', slot: 1, name: 'Kestrel P9', kind: 'pistol', price: 0,
    damage: 26, headMult: 2.5, limbMult: 0.75, mag: 12, reserve: 48,
    fireGap: 0.22, reloadTime: 1.3, auto: false, pellets: 1,
    spread: 0.004, moveSpread: 0.02, recoil: 0.011, kick: 0.04,
  },
  smg: {
    id: 'smg', slot: 2, name: 'Hornet SMG', kind: 'smg', price: 500,
    damage: 19, headMult: 2.5, limbMult: 0.75, mag: 28, reserve: 84,
    fireGap: 0.075, reloadTime: 1.7, auto: true, pellets: 1,
    spread: 0.009, moveSpread: 0.026, recoil: 0.007, kick: 0.03,
  },
  rifle: {
    id: 'rifle', slot: 3, name: 'Vandal-7', kind: 'rifle', price: 900,
    damage: 34, headMult: 2.5, limbMult: 0.75, mag: 25, reserve: 75,
    fireGap: 0.11, reloadTime: 2.1, auto: true, pellets: 1,
    spread: 0.0022, moveSpread: 0.028, recoil: 0.013, kick: 0.055,
  },
  shotgun: {
    id: 'shotgun', slot: 4, name: 'Breacher', kind: 'shotgun', price: 700,
    damage: 11, headMult: 2.5, limbMult: 0.75, mag: 6, reserve: 24,
    fireGap: 0.85, reloadTime: 2.4, auto: false, pellets: 8,
    spread: 0.03, moveSpread: 0.02, recoil: 0.03, kick: 0.11,
  },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'rifle', 'shotgun'];

const MUZZLE_TIME = 0.06;

export function createWeapons(camera, state) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  function buildModel(def) {
    const model = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), bodyMat);
    const barrelLen = def.kind === 'shotgun' ? 0.55 : def.kind === 'pistol' ? 0.2 : 0.4;
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, barrelLen), grip);
    barrel.position.set(0, 0.025, -0.3 - barrelLen / 2 + 0.2);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.06), accentMat);
    sight.position.set(0, 0.075, -0.1);
    model.add(receiver, barrel, stock, sight);
    if (def.kind === 'shotgun') {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.18), accentMat);
      pump.position.set(0, -0.02, -0.35);
      model.add(pump);
    }
    if (def.kind === 'smg') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), grip);
      mag.position.set(0, -0.12, 0.05);
      model.add(mag);
    }
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    return model;
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const models = {};
  for (const id of WEAPON_ORDER) models[id] = buildModel(WEAPONS[id]);
  models.pistol.visible = true;

  const ammo = {};
  for (const id of WEAPON_ORDER) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve, owned: id === 'pistol' };

  const wstate = {
    current: 'pistol', cooldown: 0, reloadLeft: 0, reloadTotal: 1, flash: 0, kick: 0, bloom: 0,
  };

  function currentDef() {
    return WEAPONS[wstate.current];
  }

  function step(dt) {
    wstate.cooldown = Math.max(0, wstate.cooldown - dt);
    wstate.flash = Math.max(0, wstate.flash - dt);
    wstate.kick += (0 - wstate.kick) * Math.min(1, dt * 14);
    wstate.bloom = Math.max(0, wstate.bloom - dt * 0.05);
    state.player.bloom = wstate.bloom;
    const model = models[wstate.current];
    model.position.z = -0.42 + wstate.kick;
    model.rotation.x = wstate.kick * 2.2;
    flash.visible = wstate.flash > 0;
    flash.rotation.z = wstate.flash * 30;
    flashLight.intensity = wstate.flash > 0 ? 18 : 0;
    if (wstate.reloadLeft > 0) {
      wstate.reloadLeft = Math.max(0, wstate.reloadLeft - dt);
      const def = currentDef();
      model.rotation.x = -0.55 * Math.min(1, (def.reloadTime - wstate.reloadLeft) * 2);
      if (wstate.reloadLeft === 0) {
        const a = ammo[wstate.current];
        const need = def.mag - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
  }

  return {
    state: wstate,
    ammo,
    def() {
      return currentDef();
    },
    step,
    ready() {
      const a = ammo[wstate.current];
      return a.mag > 0 && wstate.cooldown === 0 && wstate.reloadLeft === 0;
    },
    pullTrigger() {
      const def = currentDef();
      wstate.cooldown = def.fireGap;
      wstate.flash = MUZZLE_TIME;
      wstate.kick = def.kick;
      wstate.bloom = Math.min(0.035, wstate.bloom + (def.kind === 'shotgun' ? 0.02 : 0.006));
    },
    takeRound() {
      const a = ammo[wstate.current];
      if (a.mag <= 0) return false;
      a.mag -= 1;
      return true;
    },
    reload() {
      const def = currentDef();
      const a = ammo[wstate.current];
      if (wstate.reloadLeft > 0 || a.mag === def.mag || a.reserve === 0) return false;
      wstate.reloadLeft = def.reloadTime;
      return true;
    },
    spread(speed, airborne, crouching) {
      const def = currentDef();
      let s = def.spread + Math.min(1, speed / 5.2) * def.moveSpread + wstate.bloom;
      if (airborne) s *= 1.9;
      if (crouching) s *= 0.6;
      return s;
    },
    switchTo(id) {
      if (!ammo[id].owned || id === wstate.current || wstate.reloadLeft > 0) return false;
      models[wstate.current].visible = false;
      wstate.current = id;
      models[id].visible = true;
      wstate.cooldown = Math.max(wstate.cooldown, 0.25);
      return true;
    },
    buy(id) {
      const def = WEAPONS[id];
      if (ammo[id].owned) return 'owned';
      if (state.money < def.price) return 'poor';
      state.money -= def.price;
      ammo[id].owned = true;
      ammo[id].mag = def.mag;
      ammo[id].reserve = def.reserve;
      this.switchTo(id);
      return 'ok';
    },
    refillRound() {
      for (const id of WEAPON_ORDER) {
        if (!ammo[id].owned) continue;
        ammo[id].mag = WEAPONS[id].mag;
        ammo[id].reserve = WEAPONS[id].reserve;
      }
      wstate.cooldown = 0;
      wstate.reloadLeft = 0;
      wstate.flash = 0;
      wstate.kick = 0;
      wstate.bloom = 0;
    },
    resetShop() {
      for (const id of WEAPON_ORDER) {
        ammo[id].owned = id === 'pistol';
        ammo[id].mag = WEAPONS[id].mag;
        ammo[id].reserve = WEAPONS[id].reserve;
      }
      models[wstate.current].visible = false;
      wstate.current = 'pistol';
      models.pistol.visible = true;
    },
  };
}
