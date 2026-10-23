// Skeleton drawn into the same canvas that is streamed to the TV, so overlay and video are one frame.
import { PoseLandmarker } from "@mediapipe/tasks-vision";
import type { P2V } from "./repEngine";

const CONNECTIONS = PoseLandmarker.POSE_CONNECTIONS.filter(({ start, end }) => start > 10 && end > 10); // skip the face mesh
const JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const MIN_VIS = 0.5;

/** Assumes the context is already mirrored (setTransform(-1,0,0,1,w,0)), so normalized x maps straight to pixels. */
export function drawSkeleton(ctx: CanvasRenderingContext2D, lm: P2V[], w: number, h: number, flagged: number[]) {
  const s = Math.max(w, h) / 960; // line weights relative to a 960-px canvas
  ctx.lineCap = "round";
  ctx.lineWidth = 6 * s;
  ctx.strokeStyle = "rgba(255, 177, 92, 0.95)";
  ctx.beginPath();
  for (const { start, end } of CONNECTIONS) {
    const a = lm[start];
    const b = lm[end];
    if (!a || !b || (a.visibility ?? 1) < MIN_VIS || (b.visibility ?? 1) < MIN_VIS) continue;
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
  }
  ctx.stroke();
  for (const i of JOINTS) {
    const p = lm[i];
    if (!p || (p.visibility ?? 1) < MIN_VIS) continue;
    const bad = flagged.includes(i);
    ctx.fillStyle = bad ? "#ff3b30" : "#ffffff";
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, (bad ? 14 : 8) * s, 0, Math.PI * 2);
    ctx.fill();
  }
}
