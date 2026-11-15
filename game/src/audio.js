// Synthesised sound effects only: WebAudio oscillators and filtered noise, no audio
// files, no network. The context is created lazily on the first user gesture so
// autoplay rules never block the page; every call is a no-op until then.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      return false;
    }
    return true;
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, type) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  return {
    unlock,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    shot(kind) {
      if (!ensure()) return;
      if (kind === 'shotgun') {
        noise(0.22, 0.9, 900);
        tone(140, 0.12, 'sawtooth', 0.25, 60);
      } else if (kind === 'smg') {
        noise(0.09, 0.55, 1800);
        tone(220, 0.06, 'square', 0.18, 90);
      } else if (kind === 'pistol') {
        noise(0.11, 0.6, 1400);
        tone(180, 0.08, 'square', 0.2, 70);
      } else {
        noise(0.14, 0.7, 2200);
        tone(160, 0.1, 'sawtooth', 0.22, 55);
      }
    },
    enemyShot(distance) {
      if (!ensure()) return;
      const vol = Math.max(0.08, 0.5 - distance * 0.012);
      noise(0.12, vol, 1200);
      tone(150, 0.09, 'square', vol * 0.4, 60);
    },
    dryClick() {
      tone(1400, 0.04, 'square', 0.15);
    },
    reload() {
      tone(900, 0.05, 'square', 0.12);
      setTimeout(() => tone(620, 0.05, 'square', 0.12), 180);
      setTimeout(() => tone(1100, 0.05, 'square', 0.14), 420);
    },
    hit(kill) {
      tone(kill ? 1320 : 980, kill ? 0.14 : 0.07, 'sine', 0.3);
      if (kill) setTimeout(() => tone(1760, 0.12, 'sine', 0.25), 90);
    },
    hurt() {
      tone(110, 0.18, 'sawtooth', 0.3, 55);
    },
    plantBeep(final) {
      tone(final ? 1760 : 1180, final ? 0.22 : 0.09, 'sine', 0.28);
    },
    explosion() {
      noise(1.1, 1.0, 320);
      tone(70, 0.9, 'sine', 0.55, 28);
    },
    flashPop() {
      tone(2400, 0.3, 'sine', 0.2, 3200);
      noise(0.25, 0.3, 6000, 'highpass');
    },
    bounce() {
      tone(320, 0.05, 'square', 0.1, 180);
    },
    buy() {
      tone(880, 0.07, 'sine', 0.22);
      setTimeout(() => tone(1318, 0.09, 'sine', 0.22), 70);
    },
    deny() {
      tone(220, 0.12, 'square', 0.2, 160);
    },
    win() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.28), i * 110));
    },
    lose() {
      const notes = [392, 330, 262, 196];
      notes.forEach((f, i) => setTimeout(() => tone(f, 0.26, 'triangle', 0.24), i * 130));
    },
    roundStart() {
      tone(660, 0.1, 'sine', 0.22);
      setTimeout(() => tone(880, 0.14, 'sine', 0.22), 110);
    },
  };
}
