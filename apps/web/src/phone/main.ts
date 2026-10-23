// Phone sensor: camera -> MediaPipe pose -> deterministic rep engine -> mirrored canvas (video + skeleton).
// Standalone (no ?room) it is a self-test for Gate 1. Opened from the TV's QR (?room=CODE&t=TOKEN) it also
// streams the canvas to the TV over WebRTC and sends telemetry on the DataChannel.
import type { Exercise, PhoneMsg, TvMsg } from "@firefit/shared";
import { phoneConnect } from "../shared/rtc";
import { drawSkeleton } from "./draw";
import { loadPose, openCamera, type PoseModel } from "./pose";
import { RepEngine, type EngineState } from "./repEngine";

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

const engine = new RepEngine((params.get("ex") as Exercise) ?? "squat", (rep, reps) => {
  send({ t: "rep", seq: ++seq, reps, ...rep });
  canvas.classList.add("rep");
  setTimeout(() => canvas.classList.remove("rep"), 180);
  navigator.vibrate?.(40);
});

if (!window.isSecureContext) {
  ui.startMsg.textContent = "The camera needs HTTPS. Open this page from the TV's QR code or the CloudFront URL.";
  ui.go.disabled = true;
}
if (room) ui.startMsg.textContent = `Pairing with room ${room}. ` + ui.startMsg.textContent;

// Start downloading the pose model right away, while the user is still setting the phone up.
const loadMsg = document.createElement("p");
loadMsg.id = "load-msg";
ui.start.appendChild(loadMsg);
const posePromise = loadPose(params.get("model") === "lite" ? "lite" : "full", (m) => (loadMsg.textContent = m));
posePromise.catch((err) => (loadMsg.textContent = `Pose model failed: ${(err as Error).message}`));

ui.go.addEventListener("click", () => {
  ui.go.disabled = true;
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
  await video.play();
  ui.go.textContent = "Waiting for pose model…";
  pose = await posePromise;
  await navigator.wakeLock?.request("screen").catch(() => {}); // keep the phone awake on the tripod
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") navigator.wakeLock?.request("screen").catch(() => {});
  });

  sizeCanvas();
  ui.start.hidden = true;
  ui.hud.hidden = false;
  ui.tools.hidden = !!room; // exercise/reset buttons only in standalone self-test
  ui.status.textContent = room ? "Connecting to TV…" : "Self-test: do 10 squats";
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
      send({ t: "state", seq: ++seq, reps: s.reps, stage: s.stage, angle: s.angle, visible: s.visible, fps: Math.round(inferFps) });
    }
  }
  requestAnimationFrame(tick);
}

function render(s: EngineState) {
  ui.reps.textContent = String(s.reps);
  ui.stage.textContent = s.stage === "lost" ? "step into frame" : s.stage;
  ui.stage.classList.toggle("lost", s.stage === "lost");
  const cue = engine.log.at(-1)?.cue ?? "";
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
      engine.exercise = m.exercise;
      engine.reset();
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
const exButtons = { squat: $("ex-squat"), pushup: $("ex-pushup") } as const;
for (const ex of ["squat", "pushup"] as const) {
  exButtons[ex].addEventListener("click", () => {
    engine.exercise = ex;
    engine.reset();
    exButtons.squat.classList.toggle("on", ex === "squat");
    exButtons.pushup.classList.toggle("on", ex === "pushup");
    ui.status.textContent = ex === "squat" ? "Self-test: face the phone, do squats" : "Self-test: side view, phone at floor level";
  });
}
$("reset").addEventListener("click", () => engine.reset());
