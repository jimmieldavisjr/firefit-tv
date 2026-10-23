// Amazon Polly read-aloud of the after-action report (GET /workouts/{id}/voice).
// The script is composed in code from the saved coach run, so the voice says exactly what the TV shows.
import { PollyClient, SynthesizeSpeechCommand, type Engine, type VoiceId } from "@aws-sdk/client-polly";

const polly = new PollyClient({});
export const MAX_CHARS = 1000; // Polly bills per character (up to 3,000 per request); a report needs far fewer

type Report = { recap?: string; wentWell?: string[]; toFix?: string[]; nextTime?: string; focusCue?: string; insights?: string[] };

const sentence = (s: string) => {
  const t = s.trim();
  return !t ? "" : /[.!?]$/.test(t) ? t : `${t}.`;
};

/** "Workout complete. {recap} What went well: … What to fix: … {next time} Focus cue: …", cut at a sentence boundary. */
export function composeScript(r: Report): string {
  const wentWell = r.wentWell?.length ? r.wentWell : [];
  const toFix = r.toFix?.length ? r.toFix : (r.insights ?? []).slice(0, 2); // older reports only had insights
  const parts = [
    "Workout complete.",
    sentence(r.recap ?? ""),
    wentWell.length ? `What went well: ${wentWell.map(sentence).join(" ")}` : "",
    toFix.length ? `What to fix: ${toFix.map(sentence).join(" ")}` : "",
    sentence(r.nextTime ?? ""),
    r.focusCue ? `Your focus cue: ${sentence(r.focusCue)}` : "",
  ].filter(Boolean);
  let text = "";
  for (const p of parts) {
    if ((text + " " + p).trim().length > MAX_CHARS) break;
    text = (text + " " + p).trim();
  }
  return text;
}

/** Synthesize MP3 with the configured voice; generative first, neural if the generative engine errors. */
export async function speak(text: string): Promise<Buffer> {
  const voice = (process.env.VOICE_ID ?? "Matthew") as VoiceId;
  const engines: Engine[] = [(process.env.POLLY_ENGINE ?? "generative") as Engine, "neural"];
  let lastErr: unknown;
  for (const engine of [...new Set(engines)]) {
    try {
      const out = await polly.send(new SynthesizeSpeechCommand({ Text: text, TextType: "text", OutputFormat: "mp3", VoiceId: voice, Engine: engine }));
      return Buffer.from(await out.AudioStream!.transformToByteArray());
    } catch (err) {
      console.warn(`polly ${engine} failed`, (err as Error).name);
      lastErr = err;
    }
  }
  throw lastErr;
}
