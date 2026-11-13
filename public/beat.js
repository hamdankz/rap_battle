// Free, code-generated instrumentals (no audio files, no copyright). Styles must match server.js BEATS.
window.Beat = (() => {
  let ctx, beatBus, vocalBus, timer, cfg, step = 0, next = 0, noiseBuf;
  const STYLES = {
    'Boom Bap': { bpm: 88, kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 7, 10], roots: [55, 55, 65.41, 49], bassLen: 3 },
    'Trap': { bpm: 140, kick: [0, 6, 10], snare: [8], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], bass: [0, 6, 10], roots: [49, 49, 58.27, 43.65], bassLen: 5 },
    'UK Drill': { bpm: 142, kick: [0, 7, 10, 14], snare: [8, 15], hat: [0, 2, 4, 6, 8, 10, 12, 13, 14, 15], bass: [0, 3, 7, 10], roots: [55, 55, 51.91, 46.25], bassLen: 4 },
  };
  const stepDur = () => 60 / cfg.bpm / 4;
  const env = (g, t, a, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d); };

  function init() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      beatBus = ctx.createGain(); beatBus.gain.value = 0.5;
      vocalBus = ctx.createGain(); vocalBus.gain.value = 1.5;
      const comp = ctx.createDynamicsCompressor();
      beatBus.connect(comp); vocalBus.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ctx;
  }
  function kick(t) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); env(g, t, 1, 0.35); o.connect(g).connect(beatBus); o.start(t); o.stop(t + 0.4); }
  function noise(t, d, freq, type, amp) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = ctx.createGain(); env(g, t, amp, d); s.connect(f).connect(g).connect(beatBus); s.start(t); s.stop(t + d + 0.02); }
  function snare(t) { noise(t, 0.18, 1800, 'highpass', 0.6); const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = 190; env(g, t, 0.5, 0.12); o.connect(g).connect(beatBus); o.start(t); o.stop(t + 0.15); }
  function bass(t, f, len) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04); env(g, t, 0.9, len); o.connect(g).connect(beatBus); o.start(t); o.stop(t + len + 0.05); }

  function schedule() {
    while (next < ctx.currentTime + 0.2) {
      const s = step % 16, bar = Math.floor(step / 16) % 4;
      if (cfg.kick.includes(s)) kick(next);
      if (cfg.snare.includes(s)) snare(next);
      if (cfg.hat.includes(s)) noise(next, 0.045, 7500, 'highpass', s % 4 === 0 ? 0.35 : 0.16);
      if (cfg.bass.includes(s)) bass(next, cfg.roots[bar], cfg.bassLen * stepDur());
      next += stepDur(); step++;
    }
  }
  function start(name, atTime) {
    init(); stop(); ctx.resume();
    cfg = STYLES[name] || STYLES['Boom Bap'];
    step = 0; next = atTime ?? (ctx.currentTime + 0.3);
    const t0 = next;
    timer = setInterval(schedule, 25);
    return t0; // audio-clock time of bar 0
  }
  function stop() { clearInterval(timer); timer = null; }
  return { init, start, stop, get vocal() { return vocalBus; }, get ctx() { return ctx; }, styles: STYLES };
})();
