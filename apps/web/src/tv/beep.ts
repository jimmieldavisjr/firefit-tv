// Short Web Audio cues: no audio files, nothing copyrighted.
let ac: AudioContext | undefined;

export function unlockAudio() {
  ac ??= new AudioContext();
  if (ac.state === "suspended") ac.resume().catch(() => {});
}

export function beep(freq = 880, ms = 90, gain = 0.15) {
  if (!ac) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.frequency.value = freq;
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + ms / 1000);
  o.connect(g).connect(ac.destination);
  o.start();
  o.stop(ac.currentTime + ms / 1000);
}
