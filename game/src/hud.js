// The DOM HUD: health, armour, ammo, timer, score, money, weapon, grenades,
// crosshair with a dynamic spread gap, hitmarker, kill feed, plant/defuse bar,
// buy menu, damage vignette, flash overlay and the start/round/match overlays.
// It never touches the simulation; main.js pushes state in once per frame and
// hud only writes a node when its text actually changed.
import { WEAPONS, WEAPON_ORDER } from './weapons.js';

const BUY_ITEMS = [
  { key: '1', id: 'pistol', label: 'Kestrel P9 — pistol' },
  { key: '2', id: 'smg', label: 'Hornet SMG' },
  { key: '3', id: 'rifle', label: 'Vandal-7 rifle' },
  { key: '4', id: 'shotgun', label: 'Breacher shotgun' },
  { key: '5', id: 'frag', label: 'Frag grenade' },
  { key: '6', id: 'flash', label: 'Flash grenade' },
];

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    overlay: $('overlay'), title: $('overlay-title'), copy: $('overlay-copy'),
    sub: $('overlay-sub'), play: $('play'),
    health: $('health-value'), healthBar: $('health-bar'), armour: $('armour-value'),
    armourBar: $('armour-bar'), ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'),
    ammo: $('ammo'), weapon: $('weapon-name'), timer: $('timer-value'),
    roundLabel: $('round-label'), score: $('score-value'), money: $('money-value'),
    grenades: $('grenade-count'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    feed: $('killfeed'), plantWrap: $('plant-wrap'), plantLabel: $('plant-label'),
    plantBar: $('plant-bar'), buy: $('buy-menu'), buyList: $('buy-list'),
    buyMoney: $('buy-money'), buyError: $('buy-error'), vignette: $('vignette'),
    flash: $('flash-overlay'), spike: $('spike-indicator'), message: $('message'),
    phase: $('phase-label'),
  };
  const cache = {};
  let hitTimer = 0;
  let feedCount = 0;

  function setText(el, key, value) {
    if (cache[key] === value) return;
    cache[key] = value;
    el.textContent = value;
  }
  function setWidth(el, key, pct) {
    const v = `${Math.max(0, Math.min(100, pct))}%`;
    if (cache[key] === v) return;
    cache[key] = v;
    el.style.width = v;
  }

  function buildBuy() {
    els.buyList.innerHTML = '';
    for (const item of BUY_ITEMS) {
      const row = document.createElement('div');
      row.className = 'buy-row';
      row.dataset.key = item.key;
      const price = item.id === 'frag' ? 200 : item.id === 'flash' ? 150 : WEAPONS[item.id].price;
      const name = item.id === 'frag' || item.id === 'flash' ? item.label : WEAPONS[item.id].name;
      row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${name}</span><span class="buy-price">${price === 0 ? 'FREE' : '$' + price}</span>`;
      els.buyList.appendChild(row);
    }
  }
  buildBuy();

  return {
    update(state, weapon, ammo) {
      const p = state.player;
      setText(els.health, 'hp', String(Math.max(0, Math.ceil(p.health))));
      setWidth(els.healthBar, 'hpb', p.health);
      setText(els.armour, 'ar', String(Math.max(0, Math.ceil(p.armour))));
      setWidth(els.armourBar, 'arb', p.armour);
      const a = ammo[weapon.state.current];
      setText(els.ammoMag, 'mag', String(a.mag));
      setText(els.ammoReserve, 'res', `/ ${a.reserve}`);
      els.ammo.classList.toggle('empty', a.mag === 0);
      setText(els.weapon, 'wpn', weapon.def().name);
      const mm = Math.floor(Math.max(0, state.timer) / 60);
      const ss = String(Math.floor(Math.max(0, state.timer) % 60)).padStart(2, '0');
      setText(els.timer, 'tm', `${mm}:${ss}`);
      els.timer.classList.toggle('urgent', state.timer <= 10 && state.phase === 'round');
      setText(els.roundLabel, 'rd', `ROUND ${state.round}`);
      setText(els.score, 'sc', `${state.wins} — ${state.losses}`);
      setText(els.money, 'mn', `$${state.money}`);
      setText(els.grenades, 'gr', `Frag ${state.grenades.frag} · Flash ${state.grenades.flash}`);
      setText(els.phase, 'ph', state.phase === 'buy' ? 'BUY PHASE' : state.phase === 'round' ? (state.spike.state === 'planted' ? 'SPIKE PLANTED' : 'PLANT THE SPIKE') : state.phase.toUpperCase());
      // Crosshair gap grows with spread (still / moving / bloom / airborne).
      const gap = 4 + weapon.spread(0, false, false) * 900 + p.bloom * 500;
      els.crosshair.style.setProperty('--gap', `${Math.min(26, gap).toFixed(1)}px`);
      // Plant / defuse progress.
      const planting = state.spike.state === 'planting';
      const planted = state.spike.state === 'planted';
      const defusing = planted && state.spike.defuser >= 0;
      els.plantWrap.hidden = !(planting || planted);
      if (planting) {
        setText(els.plantLabel, 'pl', `PLANTING SPIKE — SITE ${state.spike.site}`);
        setWidth(els.plantBar, 'pb', (state.spike.progress / 4.5) * 100);
      } else if (planted) {
        setText(els.plantLabel, 'pl', defusing ? `DEFUSE IN PROGRESS — ${state.bots[state.spike.defuser]?.name || 'WARDEN'}` : `SPIKE LIVE — DETONATES IN ${Math.ceil(state.spike.fuse)}s`);
        setWidth(els.plantBar, 'pb', defusing ? (state.spike.defuseProgress / 5) * 100 : (1 - state.spike.fuse / 35) * 100);
      }
      // Buy menu.
      els.buy.hidden = !state.buyOpen;
      if (state.buyOpen) {
        setText(els.buyMoney, 'bm', `$${state.money}`);
        setText(els.buyError, 'be', state.buyError || '');
        for (const row of els.buyList.children) {
          const item = BUY_ITEMS.find((b) => b.key === row.dataset.key);
          const owned = item.id !== 'frag' && item.id !== 'flash' ? ammo[item.id].owned : false;
          row.classList.toggle('owned', owned);
          row.classList.toggle('current', weapon.state.current === item.id);
        }
      }
      // Kill feed.
      while (feedCount < state.feed.length) {
        const entry = state.feed[feedCount];
        feedCount += 1;
        const div = document.createElement('div');
        div.className = `feed-${entry.kind}`;
        div.textContent = entry.text;
        els.feed.appendChild(div);
        while (els.feed.children.length > 5) els.feed.removeChild(els.feed.firstChild);
      }
      // Damage vignette fades over 0.6 s after a hit.
      const sinceHit = state.time - state.damageAt;
      els.vignette.style.opacity = sinceHit < 0.6 ? String(0.55 * (1 - sinceHit / 0.6)) : '0';
      // Flash blindness: white overlay while the player is flashed.
      const blindLeft = p.flashBlind - state.time;
      els.flash.style.opacity = blindLeft > 0 ? String(Math.min(1, blindLeft)) : '0';
      // Spike carrier indicator.
      els.spike.hidden = !(p.hasSpike && state.spike.state !== 'planted' && p.alive);
      // Centre message.
      if (state.message) {
        const age = state.time - state.message.at;
        els.message.hidden = age > 4;
        setText(els.message, 'msg', state.message.text);
        els.message.style.opacity = age > 4 ? '0' : String(Math.max(0, 1 - Math.max(0, age - 3)));
      } else {
        els.message.hidden = true;
      }
    },
    hitMarker(killed, holdMs = 90) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => els.hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    showOverlay(mode, data) {
      const texts = {
        start: { title: 'EMBERLINE', copy: 'Foundry Yard. One attacker, four Wardens. Plant the spike at A or B — or drop them all.', action: 'Click to play' },
        paused: { title: 'EMBERLINE', copy: 'Paused. Click to resume.', action: 'Click to resume' },
        round: { title: data?.text, copy: data?.sub, action: 'Next round' },
        match: { title: data?.text, copy: data?.sub, action: 'Play again' },
      };
      const t = texts[mode];
      els.title.textContent = t.title;
      els.copy.textContent = t.copy;
      els.sub.textContent = mode === 'round' ? `Earned $${data.moneyEarned} · Score ${data.wins} — ${data.losses}` : mode === 'match' ? `Final score ${data.wins} — ${data.losses}` : 'WASD move · Mouse look · Click fire · R reload · B buy · G frag · F flash · E plant · M mute';
      els.play.textContent = t.action;
      els.overlay.hidden = false;
      els.play.focus();
    },
    hideOverlay() {
      els.overlay.hidden = true;
    },
    onPlay(handler) {
      els.play.addEventListener('click', handler);
    },
  };
}
