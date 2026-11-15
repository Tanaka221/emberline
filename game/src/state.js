// The single state store. Every module reads and writes this one object; nothing
// else holds game state. The RNG is seeded (mulberry32, starter pattern) so the
// ?shot frames are deterministic: sim paths never call Math.random or Date.now.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ROUND_TIME = 100;
export const BUY_TIME = 12;
export const PLANT_TIME = 4.5;
export const FUSE_TIME = 35;
export const DEFUSE_TIME = 5;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const START_MONEY = 800;
export const KILL_REWARD = 200;
export const WIN_REWARD = 300;
export const LOSS_REWARD = 150;
export const PLANT_REWARD = 300;

export function createState(seed) {
  return {
    seed,
    rng: mulberry32(seed),
    time: 0,
    // menu | buy | round | roundEnd | matchEnd
    phase: 'menu',
    phaseTime: 0,
    round: 1,
    wins: 0,
    losses: 0,
    money: START_MONEY,
    timer: BUY_TIME,
    roundResult: null, // { text, sub, won, moneyEarned }
    matchResult: null, // { text, sub }
    player: {
      position: { x: 0, y: 0, z: 11 },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      eye: 1.6,
      height: 1.72,
      onGround: true,
      crouching: false,
      health: 100,
      armour: 50,
      alive: true,
      hasSpike: true,
      bloom: 0,
      flashBlind: 0,
    },
    // idle | planting | planted | defusing
    spike: { state: 'idle', site: null, progress: 0, fuse: 0, defuseProgress: 0, defuser: -1 },
    bots: [], // filled by bots.js: { id, name, hp, alive, state, ... }
    grenades: { frag: 0, flash: 0 },
    kills: 0,
    deaths: 0,
    shotsFired: 0,
    shotsHit: 0,
    noise: null, // { x, z, at } latest loud event bots hear
    feed: [], // { text, kind, at }
    message: null, // transient centre message { text, at }
    muted: false,
    buyOpen: false,
    buyError: null,
    hitmark: 0, // 0 none, 1 hit, 2 kill; set by main, read by hud
    hitmarkAt: 0,
    damageAt: 0, // last time player took damage (vignette)
    lastKiller: null,
  };
}

export function feed(state, text, kind) {
  state.feed.push({ text, kind: kind || 'info', at: state.time });
  if (state.feed.length > 5) state.feed.shift();
}
