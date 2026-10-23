// Generates FireFIT's bundled audio with ElevenLabs (development time only; the app never calls ElevenLabs).
//   Music: POST /v1/music (force_instrumental)   Sound effects: POST /v1/sound-generation
// Key: ELEVENLABS_API_KEY from the environment or from .env.elevenlabs (gitignored). Never commit it.
//   node scripts/gen-audio.mjs            # generate anything missing
//   node scripts/gen-audio.mjs --force    # regenerate everything
//   node scripts/gen-audio.mjs sfx        # only sound effects (or: music)
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "apps/tv-shell/app/src/main/assets/audio"); // bundled in the APK, played natively
const WEB = join(root, "apps/web/public/audio"); // same files for the browser fallback (dev, non-shell)
const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.find((a) => a === "music" || a === "sfx");

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const f = join(root, ".env.elevenlabs");
  if (existsSync(f)) {
    const m = readFileSync(f, "utf8").match(/ELEVENLABS_API_KEY\s*=\s*["']?([^"'\r\n]+)/);
    if (m) return m[1].trim();
  }
  throw new Error("Set ELEVENLABS_API_KEY or create .env.elevenlabs with ELEVENLABS_API_KEY=...");
}
const KEY = apiKey();

const MUSIC = {
  home: {
    ms: 120_000,
    prompt:
      "Modern premium electronic ambient instrumental for a fitness app home screen. 95 BPM. Relaxed, atmospheric, futuristic and quietly motivational. " +
      "Warm analog synth pads, soft plucked arpeggios, subtle tight percussion, smooth melodic hook. Even energy from start to end with no big drops, " +
      "so it loops seamlessly under menus. No vocals.",
  },
  workout_1: {
    ms: 150_000,
    prompt:
      "High-energy electronic fitness track, 132 BPM. Powerful sub bass, punchy four-on-the-floor kick, crisp claps and hi-hats, driving saw synths, " +
      "uplifting motivational lead melody. Consistent intensity for strength training, no long breakdowns. Instrumental, no vocals.",
  },
  workout_2: {
    ms: 150_000,
    prompt:
      "Driving electro-house workout instrumental, 128 BPM. Rolling bassline, tight drums, rhythmic synth stabs, bright arpeggios and an anthemic hook. " +
      "Steady sustained energy for cardio and circuits. No vocals.",
  },
  workout_3: {
    ms: 150_000,
    prompt:
      "Dark, focused synthwave fitness instrumental, 140 BPM. Deep pulsing bass, hard-hitting drums, gritty synth lead, cinematic tension that keeps building " +
      "without dropping out. Built for heavy sets and planks. No vocals.",
  },
};

const STYLE = "Modern, minimal, polished, premium fitness app interface sound, clean digital synth, no voice";
const SFX = {
  nav: { s: 0.5, text: `Very soft short UI tick when moving focus between menu items. ${STYLE}` },
  select: { s: 0.6, text: `Bright quick confirmation chime for pressing a button, two rising notes. ${STYLE}` },
  back: { s: 0.5, text: `Soft short descending swipe for going back in a menu. ${STYLE}` },
  start: { s: 1.5, text: `Energetic workout start: punchy synth hit with a short rising whoosh. ${STYLE}` },
  countdown: { s: 3.5, text: `Three-second countdown: three evenly spaced short electronic beeps one second apart, then a higher longer go tone. ${STYLE}` },
  transition: { s: 1.2, text: `Smooth airy whoosh transition between exercises. ${STYLE}` },
  rep: { s: 0.5, text: `Short satisfying pop ding for a completed repetition. ${STYLE}` },
  repcue: { s: 0.6, text: `Soft low gentle alert blip for a form warning, not harsh. ${STYLE}` },
  setdone: { s: 1.6, text: `Uplifting milestone success chime, quick ascending synth arpeggio, for finishing a set. ${STYLE}` },
  complete: { s: 3.5, text: `Triumphant short workout complete fanfare, bright synth chords with sparkle. ${STYLE}` },
  achievement: { s: 2, text: `Achievement unlocked notification, sparkling shimmer with a confident chime. ${STYLE}` },
};

async function post(path, body, file) {
  const r = await fetch(`https://api.elevenlabs.io${path}`, {
    method: "POST",
    headers: { "xi-api-key": KEY, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${(await r.text()).slice(0, 300)}`);
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(file, buf);
  return buf.length;
}

mkdirSync(OUT, { recursive: true });
mkdirSync(WEB, { recursive: true });
const jobs = [];
if (only !== "sfx")
  for (const [name, m] of Object.entries(MUSIC))
    jobs.push([`music_${name}.mp3`, () => post("/v1/music?output_format=mp3_44100_128", { prompt: m.prompt, music_length_ms: m.ms, force_instrumental: true }, join(OUT, `music_${name}.mp3`))]);
if (only !== "music")
  for (const [name, x] of Object.entries(SFX))
    jobs.push([`sfx_${name}.mp3`, () => post("/v1/sound-generation?output_format=mp3_44100_128", { text: x.text, duration_seconds: x.s, prompt_influence: 0.6 }, join(OUT, `sfx_${name}.mp3`))]);

for (const [file, run] of jobs) {
  if (!force && existsSync(join(OUT, file))) {
    console.log("have", file);
  } else {
    process.stdout.write(`generating ${file}… `);
    try {
      const bytes = await run();
      console.log(`${(bytes / 1024).toFixed(0)} KB`);
    } catch (err) {
      console.log("FAILED", err.message);
      continue;
    }
  }
  copyFileSync(join(OUT, file), join(WEB, file));
}
