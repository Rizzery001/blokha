/**
 * Звуки игры синтезируются Web Audio API — без аудиофайлов.
 * Звук включается после первого жеста пользователя (ограничение браузеров).
 */
const KEY = 'blokha.sound';
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === 'off';
  } catch {
    return false;
  }
})();

export function isMuted() {
  return muted;
}
export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem(KEY, v ? 'off' : 'on');
  } catch {
    /* ignore */
  }
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Вызывать на первом клике, чтобы разблокировать звук. */
export function unlockAudio() {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  g.gain.value = 0;
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.01);
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; at?: number; slideTo?: number } = {}) {
  const c = ac();
  if (!c || muted) return;
  const t0 = c.currentTime + (opts.at ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t0);
  if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.2, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.15, at = 0, filterHz = 1800) {
  const c = ac();
  if (!c || muted) return;
  const t0 = c.currentTime + at;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filterHz;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}

export const sfx = {
  /** стук кубика: несколько ударов с затуханием */
  dice() {
    for (let i = 0; i < 6; i++) noise(0.08, 0.25 - i * 0.03, i * 0.12 + Math.random() * 0.03, 900 + i * 200);
    tone(180, 0.06, { type: 'triangle', gain: 0.12, at: 0.75 });
  },
  land() {
    noise(0.12, 0.3, 0, 600);
    tone(140, 0.12, { type: 'triangle', gain: 0.2 });
  },
  step() {
    noise(0.04, 0.12, 0, 2500);
    tone(520 + Math.random() * 60, 0.05, { type: 'triangle', gain: 0.08 });
  },
  spawn() {
    tone(440, 0.08, { type: 'triangle', gain: 0.15 });
    tone(660, 0.12, { type: 'triangle', gain: 0.15, at: 0.08 });
  },
  six() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, { type: 'square', gain: 0.08, at: i * 0.07 }));
  },
  capture() {
    noise(0.18, 0.35, 0, 400);
    tone(300, 0.35, { type: 'sawtooth', gain: 0.18, slideTo: 60 });
  },
  bonus() {
    [660, 880, 1320].forEach((f, i) => tone(f, 0.12, { type: 'triangle', gain: 0.14, at: i * 0.08 }));
  },
  penalty() {
    [330, 262, 196].forEach((f, i) => tone(f, 0.18, { type: 'sawtooth', gain: 0.1, at: i * 0.12 }));
  },
  burned() {
    tone(220, 0.25, { type: 'sine', gain: 0.12, slideTo: 110 });
  },
  autoForward() {
    tone(400, 0.4, { type: 'sine', gain: 0.12, slideTo: 1200 });
  },
  autoBackward() {
    tone(1000, 0.45, { type: 'sine', gain: 0.12, slideTo: 250 });
  },
  achievement() {
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.16, { type: 'triangle', gain: 0.12, at: i * 0.06 }));
  },
  win() {
    const seq = [523, 659, 784, 1047, 784, 1047, 1319];
    seq.forEach((f, i) => tone(f, i === seq.length - 1 ? 0.6 : 0.18, { type: 'square', gain: 0.1, at: i * 0.15 }));
    seq.forEach((f, i) => tone(f / 2, i === seq.length - 1 ? 0.6 : 0.18, { type: 'triangle', gain: 0.08, at: i * 0.15 }));
  },
  click() {
    tone(900, 0.03, { type: 'square', gain: 0.05 });
  },
  reaction() {
    tone(700, 0.08, { type: 'triangle', gain: 0.08 });
    tone(900, 0.1, { type: 'triangle', gain: 0.08, at: 0.06 });
  },
  reminder() {
    tone(880, 0.1, { type: 'sine', gain: 0.1 });
    tone(880, 0.1, { type: 'sine', gain: 0.1, at: 0.2 });
  },
};
