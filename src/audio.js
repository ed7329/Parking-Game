// All sounds are synthesised with the Web Audio API, so there are no audio
// files to load. Browsers only allow audio after a user gesture, so call
// unlock() from a click/key handler.

const MUTE_KEY = 'parking-game-muted';

export class Sound {
  constructor() {
    this.ctx = null;
    this.engine = null;
    this.beepTimer = 0;
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(this.ctx.destination);
    this.noise = this.makeNoise();
    this.startEngine();
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // Preference just won't persist.
    }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  startEngine() {
    const c = this.ctx;
    const low = c.createOscillator();
    low.type = 'sawtooth';
    const high = c.createOscillator();
    high.type = 'square';
    const highGain = c.createGain();
    highGain.gain.value = 0.25;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 4;
    const gain = c.createGain();
    gain.gain.value = 0;
    // A slow LFO on the volume gives the idle a lumpy, piston-like feel.
    const tremolo = c.createGain();
    tremolo.gain.value = 0.75;
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 9;
    lfoGain.gain.value = 0.25;
    lfo.connect(lfoGain).connect(tremolo.gain);

    low.connect(filter);
    high.connect(highGain).connect(filter);
    filter.connect(gain).connect(tremolo).connect(this.master);
    low.start();
    high.start();
    lfo.start();
    this.engine = { low, high, filter, gain, lfo };
  }

  // speedRatio 0..1, throttle 0..1, pitch scales the engine (trucks are lower).
  updateEngine(active, speedRatio, throttle, pitch = 1) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const rpm = 0.15 + speedRatio * 0.7 + throttle * 0.15;
    const base = (32 + rpm * 85) * pitch;
    this.engine.low.frequency.setTargetAtTime(base, t, 0.08);
    this.engine.high.frequency.setTargetAtTime(base * 2.01, t, 0.08);
    this.engine.lfo.frequency.setTargetAtTime(base / 4, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(300 + rpm * 1400 + throttle * 600, t, 0.1);
    const vol = active ? 0.06 + throttle * 0.06 + speedRatio * 0.04 : 0;
    this.engine.gain.gain.setTargetAtTime(vol, t, active ? 0.1 : 0.25);
  }

  crash(intensity) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const amount = Math.min(1, 0.3 + intensity / 6);

    const src = c.createBufferSource();
    src.buffer = this.noise;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900 + amount * 1500;
    filter.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.8 * amount, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25 + amount * 0.4);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.8);

    // Low thump for the body of the impact.
    const thump = c.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(140, t);
    thump.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const tg = c.createGain();
    tg.gain.setValueAtTime(0.9 * amount, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    thump.connect(tg).connect(this.master);
    thump.start(t);
    thump.stop(t + 0.35);
  }

  tone(freq, start, dur, type = 'sine', vol = 0.2) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    o.connect(g).connect(this.master);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  // Parking sensor: beeps faster as the nearest obstacle gets closer.
  updateSensor(dt, distance) {
    if (!this.ctx) return;
    if (distance > 1.5) {
      this.beepTimer = 0;
      return;
    }
    this.beepTimer -= dt;
    if (this.beepTimer <= 0) {
      const solid = distance < 0.3;
      this.tone(1800, this.ctx.currentTime, solid ? 0.12 : 0.07, 'sine', 0.08);
      this.beepTimer = solid ? 0.1 : 0.08 + distance * 0.35;
    }
  }

  horn() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(415, t, 0.45, 'square', 0.05);
    this.tone(520, t, 0.45, 'square', 0.04);
  }

  success() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.11, 0.35, 'triangle', 0.18));
  }

  fail() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [392, 330, 262].forEach((f, i) => this.tone(f, t + i * 0.16, 0.4, 'triangle', 0.18));
  }
}
