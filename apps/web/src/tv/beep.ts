// Short Web Audio cues for a consistent interaction feel: no audio files, nothing copyrighted.
let ac: AudioContext | undefined;

export function unlockAudio() {
  ac ??= new AudioContext();
  if (ac.state === "suspended") ac.resume().catch(() => {});
}

function tone(freq: number, ms: number, gain = 0.12, type: OscillatorType = "sine", delayMs = 0) {
  if (!ac) return;
  const t0 = ac.currentTime + delayMs / 1000;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  o.connect(g).connect(ac.destination);
  o.start(t0);
  o.stop(t0 + ms / 1000 + 0.02);
}

/** Back-compat single beep (rep counted = 880 Hz, rep with a form cue = 440 Hz). */
export function beep(freq = 880, ms = 90, gain = 0.15) {
  tone(freq, ms, gain);
}

export const sfx = {
  nav: () => tone(1320, 35, 0.05, "triangle"),
  select: () => (tone(880, 60, 0.09, "triangle"), tone(1320, 80, 0.08, "triangle", 50)),
  back: () => (tone(990, 50, 0.07, "triangle"), tone(660, 70, 0.06, "triangle", 45)),
  rep: () => tone(880, 90, 0.15),
  repCue: () => tone(440, 140, 0.14, "square"),
  start: () => (tone(660, 90, 0.12), tone(990, 160, 0.12, "sine", 90)),
  setDone: () => (tone(784, 120, 0.12), tone(988, 120, 0.12, "sine", 110), tone(1319, 260, 0.12, "sine", 220)),
  tick: () => tone(1000, 70, 0.1, "square"),
  complete: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? 420 : 140, 0.12, "sine", i * 120)),
  error: () => tone(220, 220, 0.1, "sawtooth"),
};
