// MediaPipe Pose Landmarker on the phone. Full model on the GPU delegate first; Lite / CPU as fallbacks.
// Each attempt has a timeout so a GPU init that never resolves falls through instead of spinning forever.
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

export type PoseModel = { landmarker: PoseLandmarker; label: string };
export type Progress = (msg: string) => void;

const INIT_TIMEOUT_MS = 20_000;

/** Exposed for remote debugging (chrome://inspect or the console): where loading got to. */
export const poseDebug: { stage: string; label?: string; errors: string[] } = { stage: "idle", errors: [] };
(globalThis as Record<string, unknown>).__firefitPose = poseDebug;

const withTimeout = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000}s`)), ms))]);

async function fetchModel(name: "full" | "lite", progress: Progress): Promise<Uint8Array> {
  const r = await fetch(`/models/pose_landmarker_${name}.task`);
  if (!r.ok || !r.body) throw new Error(`model ${name}: HTTP ${r.status}`);
  const total = Number(r.headers.get("content-length")) || 0;
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    progress(`Downloading ${name} model ${(got / 1e6).toFixed(1)}${total ? ` / ${(total / 1e6).toFixed(1)}` : ""} MB`);
  }
  const buf = new Uint8Array(got);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  return buf;
}

export async function loadPose(prefer: "full" | "lite", progress: Progress = () => {}): Promise<PoseModel> {
  const step = (msg: string) => {
    poseDebug.stage = msg;
    progress(msg);
  };
  step("Loading vision runtime…");
  const vision = await withTimeout(FilesetResolver.forVisionTasks("/mediapipe/wasm"), INIT_TIMEOUT_MS, "vision runtime");

  const attempts: { model: "full" | "lite"; delegate: "GPU" | "CPU" }[] =
    prefer === "full"
      ? [
          { model: "full", delegate: "GPU" },
          { model: "full", delegate: "CPU" },
          { model: "lite", delegate: "CPU" },
        ]
      : [
          { model: "lite", delegate: "GPU" },
          { model: "lite", delegate: "CPU" },
        ];
  const buffers: Partial<Record<"full" | "lite", Uint8Array>> = {};
  for (const a of attempts) {
    try {
      buffers[a.model] ??= await fetchModel(a.model, step);
      step(`Starting ${a.model} model on ${a.delegate}…`);
      const landmarker = await withTimeout(
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetBuffer: buffers[a.model], delegate: a.delegate },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        }),
        INIT_TIMEOUT_MS,
        `${a.model}/${a.delegate} init`,
      );
      poseDebug.label = `${a.model}/${a.delegate}`;
      step(`Pose model ready (${poseDebug.label})`);
      return { landmarker, label: poseDebug.label };
    } catch (err) {
      const msg = `${a.model}/${a.delegate}: ${(err as Error).message}`;
      console.warn("pose attempt failed", msg, err);
      poseDebug.errors.push(msg);
    }
  }
  step("Pose model failed");
  throw new Error(poseDebug.errors.join(" | "));
}

// 16:9 landscape so the picture fills the whole TV screen (the TV shows it edge to edge).
export async function openCamera(facing: "user" | "environment"): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 }, frameRate: { ideal: 30 } },
  });
  // Zoom all the way out when the camera allows it (some phones expose their wide lens as zoom < 1).
  const track = stream.getVideoTracks()[0];
  const zoom = (track?.getCapabilities?.() as { zoom?: { min: number } } | undefined)?.zoom;
  if (zoom && zoom.min < 1) await track.applyConstraints({ advanced: [{ zoom: zoom.min } as MediaTrackConstraintSet] }).catch(() => {});
  return stream;
}
