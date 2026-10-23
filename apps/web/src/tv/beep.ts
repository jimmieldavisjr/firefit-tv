// FireFIT audio from the web app's side.
// In the Fire TV shell, cues and music play natively (ElevenLabs-generated files bundled in the APK: Media3 ExoPlayer
// for music, SoundPool for effects). In a browser, or before audio is bundled, effects fall back to short synthesized
// Web Audio tones and music to the same files served from /audio. Nothing calls ElevenLabs at runtime.
let ac: AudioContext | undefined;
const host = () => (window.FireFitHost?.hasNativeAudio?.() ? window.FireFitHost : undefined);

export function unlockAudio() {
  ac ??= new AudioContext();
  if (ac.state === "suspended") ac.resume().catch(() => {});
}

let sfxVol = 0.8;
let musicVol = 0.55;

function tone(freq: number, ms: number, gain = 0.12, type: OscillatorType = "sine", delayMs = 0) {
  if (!ac || sfxVol <= 0) return;
  const t0 = ac.currentTime + delayMs / 1000;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * sfxVol), t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  o.connect(g).connect(ac.destination);
  o.start(t0);
  o.stop(t0 + ms / 1000 + 0.02);
}

/** name = the native file (sfx_<name>.mp3); fallback = the synthesized stand-in */
const cue = (name: string, fallback: () => void) => () => {
  const h = host();
  if (h?.sfx) h.sfx(name);
  else fallback();
};

export const sfx = {
  nav: cue("nav", () => tone(1320, 35, 0.05, "triangle")),
  select: cue("select", () => (tone(880, 60, 0.09, "triangle"), tone(1320, 80, 0.08, "triangle", 50))),
  back: cue("back", () => (tone(990, 50, 0.07, "triangle"), tone(660, 70, 0.06, "triangle", 45))),
  rep: cue("rep", () => tone(880, 90, 0.15)),
  repCue: cue("repcue", () => tone(440, 140, 0.14, "square")),
  start: cue("start", () => (tone(660, 90, 0.12), tone(990, 160, 0.12, "sine", 90))),
  transition: cue("transition", () => tone(520, 220, 0.08, "sine")),
  setDone: cue("setdone", () => (tone(784, 120, 0.12), tone(988, 120, 0.12, "sine", 110), tone(1319, 260, 0.12, "sine", 220))),
  /** the three-second countdown before the next set: one native clip, or three ticks + go */
  countdown: cue("countdown", () => [0, 1000, 2000].forEach((d) => tone(1000, 70, 0.1, "square", d))),
  complete: cue("complete", () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? 420 : 140, 0.12, "sine", i * 120))),
  achievement: cue("achievement", () => [988, 1319, 1760].forEach((f, i) => tone(f, 160, 0.1, "triangle", i * 90))),
  error: () => tone(220, 220, 0.1, "sawtooth"),
};

// ---------- music ----------
export type MusicMode = "home" | "workout" | "paused" | "off";
const TRACKS: Record<"home" | "workout", string[]> = {
  home: ["/audio/music_home.mp3"],
  workout: ["/audio/music_workout_1.mp3", "/audio/music_workout_2.mp3", "/audio/music_workout_3.mp3"],
};
let el: HTMLAudioElement | undefined;
let list: "home" | "workout" | "" = "";
let idx = 0;
let duck = 1;
let fadeTimer: number | undefined;

function fade(to: number, ms: number, then?: () => void) {
  if (!el) return then?.();
  window.clearInterval(fadeTimer);
  const from = el.volume;
  const t0 = performance.now();
  fadeTimer = window.setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / Math.max(1, ms));
    if (el) el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k >= 1) {
      window.clearInterval(fadeTimer);
      then?.();
    }
  }, 40);
}

export function setMusic(mode: MusicMode) {
  const h = host();
  if (h?.music) return h.music(mode);
  if (mode === "paused") {
    duck = 0.3;
    return fade(musicVol * duck, 500);
  }
  duck = 1;
  const wanted = mode === "off" ? "" : mode;
  if (wanted === list) return el && fade(musicVol, 600);
  fade(0, list ? 700 : 0, () => {
    el?.pause();
    list = wanted;
    if (!wanted) return;
    idx = Math.floor(Math.random() * TRACKS[wanted].length);
    el = new Audio(TRACKS[wanted][idx]);
    el.volume = 0;
    el.loop = TRACKS[wanted].length === 1;
    el.onended = () => {
      if (!el || !list) return;
      idx = (idx + 1) % TRACKS[list].length;
      el.src = TRACKS[list][idx];
      el.play().catch(() => {});
    };
    el.play().then(() => fade(musicVol, 1400)).catch(() => {}); // files may not exist in dev: stay silent
  });
}

// ---------- volumes (persisted natively in the shell, per browser otherwise) ----------
export function getVolumes(): { music: number; sfx: number } {
  const h = host();
  try {
    if (h?.volumes) return JSON.parse(h.volumes());
    const v = JSON.parse(localStorage.getItem("firefit.volumes") ?? "null");
    if (v) return v;
  } catch {
    /* defaults */
  }
  return { music: musicVol, sfx: sfxVol };
}

export function setVolumes(music: number, effects: number) {
  musicVol = Math.max(0, Math.min(1, music));
  sfxVol = Math.max(0, Math.min(1, effects));
  const h = host();
  if (h?.setVolumes) return h.setVolumes(musicVol, sfxVol);
  try {
    localStorage.setItem("firefit.volumes", JSON.stringify({ music: musicVol, sfx: sfxVol }));
  } catch {
    /* not persisted */
  }
  if (el) fade(musicVol * duck, 200);
}

{
  const v = getVolumes();
  musicVol = v.music;
  sfxVol = v.sfx;
}
