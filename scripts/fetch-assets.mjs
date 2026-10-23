// Copies the MediaPipe wasm runtime into apps/web/public and downloads the pose models.
// Run once after `pnpm install` (and in CI before building): `pnpm assets`.
import { cpSync, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "apps/web/public");

// pnpm links the package into apps/web/node_modules; its exports map hides package.json from require.resolve
const wasmSrc = join(root, "apps/web/node_modules/@mediapipe/tasks-vision/wasm");
if (!existsSync(wasmSrc)) throw new Error(`missing ${wasmSrc}: run pnpm install first`);
cpSync(wasmSrc, join(pub, "mediapipe/wasm"), { recursive: true });
console.log("copied", wasmSrc, "-> public/mediapipe/wasm");

const MODELS = {
  "pose_landmarker_full.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
  "pose_landmarker_lite.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
};
mkdirSync(join(pub, "models"), { recursive: true });
for (const [name, url] of Object.entries(MODELS)) {
  const dest = join(pub, "models", name);
  if (existsSync(dest)) {
    console.log("have", name);
    continue;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(dest));
  console.log("downloaded", name);
}
