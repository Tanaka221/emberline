// Round, economy and objective logic: buy phase -> round -> round end -> next
// round or match end. First to 5, max 9 rounds, 100 s rounds. The attacker wins
// a round by eliminating all Wardens or by a spike detonation; the Wardens win
// by eliminating the player, by the timer expiring unplanted, or by defusing.
import { feed, ROUND_TIME, BUY_TIME, PLANT_TIME, FUSE_TIME, DEFUSE_TIME, WIN_ROUNDS, MAX_ROUNDS, START_MONEY, KILL_REWARD, WIN_REWARD, LOSS_REWARD, PLANT_REWARD } from './state.js';
import { SITES } from './world.js';

export function createSim(state, hooks) {
  // hooks: { onRoundStart(), onRoundEnd(result), onMatchEnd(result), onPlant(), onDetonate(), onDefuse() }

  function award(amount, reason) {
    state.money += amount;
    return amount;
  }

  function startBuyPhase() {
    state.phase = 'buy';
    state.phaseTime = 0;
    state.timer = BUY_TIME;
    state.buyOpen = true;
    state.spike.state = 'idle';
    state.spike.site = null;
    state.spike.progress = 0;
    state.spike.fuse = 0;
    state.spike.defuseProgress = 0;
    state.spike.defuser = -1;
    hooks.onRoundStart();
  }

  function startRound() {
    state.phase = 'round';
    state.phaseTime = 0;
    state.timer = ROUND_TIME;
    state.buyOpen = false;
    state.message = { text: `ROUND ${state.round} — PLANT THE SPIKE AT A OR B`, at: state.time };
  }

  function endRound(won, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    const moneyEarned = won ? WIN_REWARD : LOSS_REWARD;
    award(moneyEarned, won ? 'win' : 'loss');
    if (won) state.wins += 1;
    else state.losses += 1;
    state.phase = 'roundEnd';
    state.phaseTime = 0;
    state.timer = 5;
    state.buyOpen = false;
    state.spike.state = 'idle';
    state.roundResult = {
      text: won ? 'ROUND WON' : 'ROUND LOST',
      sub: reason,
      won,
      moneyEarned,
    };
    feed(state, won ? `Round ${state.round} won — ${reason}` : `Round ${state.round} lost — ${reason}`, won ? 'good' : 'bad');
    hooks.onRoundEnd(state.roundResult);
    if (state.wins >= WIN_ROUNDS || state.losses >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      finishMatch();
    }
  }

  function finishMatch() {
    const won = state.wins > state.losses;
    state.phase = 'matchEnd';
    state.phaseTime = 0;
    state.matchResult = {
      text: won ? 'MATCH WON' : 'MATCH LOST',
      sub: `Emberline ${state.wins} — ${state.losses} Wardens. ${won ? 'The yard is yours.' : 'The Wardens hold the yard.'}`,
    };
    hooks.onMatchEnd(state.matchResult);
  }

  function nextRound() {
    state.round += 1;
    startBuyPhase();
  }

  function restartMatch() {
    state.round = 1;
    state.wins = 0;
    state.losses = 0;
    state.money = START_MONEY;
    state.kills = 0;
    state.deaths = 0;
    state.roundResult = null;
    state.matchResult = null;
    state.feed.length = 0;
    hooks.onMatchRestart();
    startBuyPhase();
  }

  function siteAt(x, z) {
    for (const [name, site] of Object.entries(SITES)) {
      if (Math.hypot(x - site.x, z - site.z) <= site.r) return name;
    }
    return null;
  }

  function onKill(botName) {
    state.kills += 1;
    award(KILL_REWARD, 'kill');
  }

  // Called every fixed step. Returns nothing; drives phase timers, plant/defuse.
  function step(dt) {
    state.phaseTime += dt;
    if (state.phase === 'buy') {
      state.timer = Math.max(0, BUY_TIME - state.phaseTime);
      if (state.phaseTime >= BUY_TIME) startRound();
      return;
    }
    if (state.phase === 'roundEnd') {
      if (state.phaseTime >= 5) {
        if (state.phase === 'roundEnd') nextRound();
      }
      return;
    }
    if (state.phase !== 'round') return;

    // Planting: progress only while the player holds E inside a site.
    if (state.spike.state === 'planting') {
      const p = state.player;
      const site = siteAt(p.position.x, p.position.z);
      if (!p.alive || !site || site !== state.spike.site) {
        state.spike.state = 'idle';
        state.spike.progress = 0;
        state.spike.site = null;
      } else {
        state.spike.progress += dt;
        if (Math.floor(state.spike.progress * 4) !== Math.floor((state.spike.progress - dt) * 4)) {
          hooks.onPlantTick();
        }
        if (state.spike.progress >= PLANT_TIME) {
          state.spike.state = 'planted';
          state.spike.fuse = FUSE_TIME;
          state.spike.progress = 0;
          award(PLANT_REWARD, 'plant');
          feed(state, `Spike planted at Site ${state.spike.site} — +$${PLANT_REWARD}`, 'good');
          hooks.onPlant();
        }
      }
    }

    // Fuse: detonation wins the round for the attacker.
    if (state.spike.state === 'planted') {
      state.spike.fuse -= dt;
      state.timer = Math.max(0, state.spike.fuse);
      // A living bot standing on the planted site defuses in 5 s.
      const site = SITES[state.spike.site];
      let defuser = -1;
      for (const bot of state.bots) {
        if (!bot.alive) continue;
        if (Math.hypot(bot.group.position.x - site.x, bot.group.position.z - site.z) <= 2.2) {
          defuser = bot.id;
          break;
        }
      }
      if (defuser >= 0) {
        state.spike.defuser = defuser;
        state.spike.defuseProgress += dt;
        if (state.spike.defuseProgress >= DEFUSE_TIME) {
          state.spike.state = 'idle';
          state.spike.defuseProgress = 0;
          feed(state, `${state.bots[defuser].name} defused the spike`, 'bad');
          hooks.onDefuse();
          endRound(false, 'Spike defused');
          return;
        }
      } else {
        state.spike.defuser = -1;
        state.spike.defuseProgress = 0;
      }
      if (state.spike.fuse <= 0) {
        hooks.onDetonate();
        endRound(true, 'Spike detonated');
        return;
      }
    } else {
      state.timer = Math.max(0, ROUND_TIME - state.phaseTime);
      if (state.timer <= 0) {
        endRound(false, 'Time expired — no plant');
        return;
      }
    }
  }

  return {
    startBuyPhase,
    startRound,
    endRound,
    nextRound,
    restartMatch,
    siteAt,
    onKill,
    step,
  };
}
