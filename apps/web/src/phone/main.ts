// Phone sensor: camera -> MediaPipe pose -> deterministic rep engine -> mirrored canvas (video + skeleton).
// Standalone (no ?room) it is a self-test for Gate 1. Opened from the TV's QR (?room=CODE&t=TOKEN) it also
// streams the canvas to the TV over WebRTC and sends telemetry on the DataChannel.
import type { Exercise, PhoneMsg, TvMsg } from "@firefit/shared";
import { phoneConnect } from "../shared/rtc";
import { drawSkeleton } from "./draw";
import { loadPose, openCamera, type PoseModel } from "./pose";
import { PlankEngine, RepEngine, type EngineState } from "./repEngine";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>("cam");
const canvas = $<HTMLCanvasElement>("out");
const ctx = canvas.getContext("2d", { alpha: false })!;
const ui = {
  status: $("status"),
  debug: $("debug"),
  hud: $("hud"),
  reps: $("reps"),
  stage: $("stage"),
  cue: $("cue"),
  tools: $("tools"),
  start: $("start"),
  startMsg: $("start-msg"),
  go: $<HTMLButtonElement>("go"),
};

const params = new URLSearchParams(location.search);
const room = params.get("room");
const token = params.get("t");
const STREAM_LONG_SIDE = 960; // Gate 0 decision: 960x540 @ 24 fps toward the 1.3 GB Fire TV Stick
const STREAM_FPS = 24;
const PUBLISH_MS = 100; // state messages at 10 Hz

let pose: PoseModel;
let send: (m: PhoneMsg) => void = () => {};
let seq = 0;
let counting = true;
let lastPublish = 0;
let lastVideoTime = -1;
let inferFps = 0;
let lastInfer = 0;
let lastCue = "";

const onRep = (rep: import("@firefit/shared").Rep, reps: number) => {
  send({ t: "rep", seq: ++seq, reps, ...rep });
  canvas.classList.add("rep");
  setTimeout(() => canvas.classList.remove("rep"), 180);
  navigator.vibrate?.(40);
};
const makeEngine = (ex: Exercise) => (ex === "plank" ? new PlankEngine() : new RepEngine(ex, onRep));
let engine: RepEngine | PlankEngine = makeEngine((params.get("ex") as Exercise) ?? "squat");

if (!window.isSecureContext) {
  ui.startMsg.textContent = "The camera needs HTTPS. Open this page from the TV's QR code or the CloudFront URL.";
  ui.go.disabled = true;
}
if (room) ui.startMsg.textContent = `Pairing with room ${room}. ` + ui.startMsg.textContent;

// Surface unexpected errors on screen: there is no console on a phone propped on a tripod.
window.addEventListener("error", (e) => (ui.status.textContent = `Error: ${e.message}`));
window.addEventListener("unhandledrejection", (e) => (ui.status.textContent = `Error: ${(e.reason as Error)?.message ?? e.reason}`));

// Start downloading the pose model right away, while the user is still setting the phone up.
const loadMsg = document.createElement("p");
loadMsg.id = "load-msg";
ui.start.appendChild(loadMsg);
const posePromise = loadPose(params.get("model") === "lite" ? "lite" : "full", (m) => (loadMsg.textContent = m));
posePromise.catch((err) => (loadMsg.textContent = `Pose model failed: ${(err as Error).message}`));

const portrait = matchMedia("(orientation: portrait)");

ui.go.addEventListener("click", () => {
  if (portrait.matches) return; // the rotate prompt covers the page until the phone is sideways
  ui.go.disabled = true;
  // Full screen + landscape lock keeps the view steady once the phone is propped up (Android Chrome; ignored elsewhere).
  document.documentElement
    .requestFullscreen?.({ navigationUI: "hide" })
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape"))
    .catch(() => {});
  start().catch((err) => {
    console.error(err);
    ui.go.disabled = false;
    ui.startMsg.textContent = `Couldn't start: ${(err as Error).message}`;
  });
});

async function start() {
  ui.go.textContent = "Opening camera…";
  const cam = await openCamera(params.get("cam") === "back" ? "environment" : "user");
  video.srcObject = cam;
  ui.go.textContent = "Starting video…";
  await Promise.race([video.play(), new Promise((r) => setTimeout(r, 4000))]); // never block on play()
  ui.go.textContent = "Waiting for pose model…";
  pose = await posePromise;
  const keepAwake = () => navigator.wakeLock?.request("screen").catch(() => {}); // fire and forget
  keepAwake();
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && keepAwake());

  sizeCanvas();
  ui.start.hidden = true;
  ui.hud.hidden = false;
  ui.tools.hidden = !!room; // exercise/reset buttons only in standalone self-test
  ui.status.textContent = room ? "Connecting to TV…" : SELF_TEST[engine.exercise];
  requestAnimationFrame(tick);
  if (room && token) connect(room, token).catch((err) => (ui.status.textContent = `Pairing failed: ${err.message}`));
}

function sizeCanvas() {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const k = STREAM_LONG_SIDE / Math.max(vw, vh);
  canvas.width = Math.round(vw * k);
  canvas.height = Math.round(vh * k);
}

function tick(now: number) {
  if (video.videoWidth && canvas.width !== Math.round((video.videoWidth * STREAM_LONG_SIDE) / Math.max(video.videoWidth, video.videoHeight)))
    sizeCanvas(); // phone rotated
  const w = canvas.width;
  const h = canvas.height;
  ctx.setTransform(-1, 0, 0, 1, w, 0); // mirror once; the skeleton inherits it
  ctx.drawImage(video, 0, 0, w, h);

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const r = pose.landmarker.detectForVideo(video, now);
    if (lastInfer) inferFps = 0.9 * inferFps + 0.1 * (1000 / (now - lastInfer));
    lastInfer = now;
    const img = r.landmarks[0];
    const world = r.worldLandmarks[0];
    const s: EngineState = img && world && counting ? engine.update(img, world, now) : engine.lost(now);
    if (img) drawSkeleton(ctx, img, w, h, s.flagged);
    render(s);
    if (now - lastPublish >= PUBLISH_MS) {
      lastPublish = now;
      send({
        t: "state",
        seq: ++seq,
        reps: s.reps,
        stage: s.stage,
        angle: s.angle,
        visible: s.visible,
        fps: Math.round(inferFps),
        ...(s.holdMs !== undefined ? { holdMs: s.holdMs, good: s.good } : {}),
        ...(s.cue ? { cue: s.cue } : {}),
      });
    }
  }
  requestAnimationFrame(tick);
}

function render(s: EngineState) {
  ui.reps.textContent = s.holdMs !== undefined ? `${Math.floor(s.holdMs / 1000)}s` : String(s.reps);
  ui.stage.textContent = s.stage === "lost" ? "step into frame" : s.stage;
  ui.stage.classList.toggle("lost", s.stage === "lost" || s.stage === "break");
  const cue = s.cue ?? engine.log.at(-1)?.cue ?? "";
  if (cue !== lastCue) ui.cue.textContent = lastCue = cue;
  ui.debug.textContent = `${engine.exercise} · angle ${s.angle}° · ${s.stage} · ${Math.round(inferFps)} fps · ${pose.label} · ${canvas.width}×${canvas.height}`;
}

async function connect(code: string, t: string) {
  const out = canvas.captureStream(STREAM_FPS);
  const link = await phoneConnect(code, t, out, onTvMsg);
  send = link.send;
  link.dc.addEventListener("open", () => {
    ui.status.textContent = `Connected to TV · room ${code}`;
    send({ t: "hello", device: navigator.userAgent.match(/\(([^)]+)\)/)?.[1] ?? "phone", fps: Math.round(inferFps) });
  });
  link.pc.addEventListener("connectionstatechange", () => {
    const st = link.pc.connectionState;
    if (st === "failed" || st === "disconnected" || st === "closed") ui.status.textContent = `TV link ${st}. Rescan the QR on the TV.`;
  });
}

function onTvMsg(m: TvMsg) {
  switch (m.t) {
    case "config":
      if (m.exercise !== engine.exercise) engine = makeEngine(m.exercise);
      engine.reset();
      ui.status.textContent = `${m.exercise === "plank" ? "Plank" : m.exercise === "pushup" ? "Push-ups" : "Squats"}: follow the TV`;
      break;
    case "start":
      counting = true;
      break;
    case "pause":
      counting = false;
      break;
    case "resetSet":
      engine.reset();
      counting = true;
      break;
    case "end":
      counting = false;
      ui.status.textContent = "Workout complete. Check the TV.";
      break;
  }
}

// Standalone self-test controls
const SELF_TEST: Record<Exercise, string> = {
  squat: "Self-test: face the phone, do squats",
  pushup: "Self-test: phone at floor level, side view, do push-ups",
  plank: "Self-test: phone at floor level, side view, hold a plank",
};
const exButtons = { squat: $("ex-squat"), pushup: $("ex-pushup"), plank: $("ex-plank") } as const;
for (const ex of ["squat", "pushup", "plank"] as const) {
  exButtons[ex].addEventListener("click", () => {
    engine = makeEngine(ex);
    for (const k of ["squat", "pushup", "plank"] as const) exButtons[k].classList.toggle("on", k === ex);
    ui.status.textContent = SELF_TEST[ex];
  });
}
$("reset").addEventListener("click", () => engine.reset());
