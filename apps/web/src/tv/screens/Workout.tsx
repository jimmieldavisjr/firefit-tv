// Workout HUD over the phone's video (the skeleton is already baked into the frames).
import type { Stage } from "@firefit/shared";
import { elapsedSec, READY_HOLD_MS, type WorkoutState } from "../workout";

export type Telemetry = {
  stage: Stage;
  angle: number;
  visible: boolean;
  phoneFps: number;
  seq: number;
  lastAt: number;
  lastRep?: { depth: number; tempo: number; cue?: string };
};
export type VideoStats = { fps?: number; decoded?: number; codec?: string; size?: string; lost?: number };

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

export function Workout(props: {
  w: WorkoutState;
  t: Telemetry;
  v: VideoStats;
  link: string;
  title: string;
  now: number;
  showDebug: boolean;
}) {
  const { w, t, v, link, title, now } = props;
  const { plan } = w;
  const live = w.phase === "paused" ? w.pausedFrom : w.phase;
  const pct = Math.min(1, w.setReps / Math.max(1, plan.targetReps));
  const disconnected = link === "failed" || link === "disconnected" || link === "closed";
  const upNext =
    w.set < plan.sets ? `Rest ${plan.restSec}s, then set ${w.set + 1} of ${plan.sets}` : "Last set: finish strong";

  return (
    <div className="workout">
      <div className="hud-tl">
        <div className="ring" style={{ ["--p" as string]: pct }}>
          <span className="ring-n">{w.setReps}</span>
          <span className="ring-d">/ {plan.targetReps}</span>
        </div>
        <div className="set-label">
          Set {Math.min(w.set, plan.sets)} of {plan.sets}
        </div>
        {live === "active" && (
          <div className={"stage " + t.stage}>{t.stage === "lost" ? "Step into frame" : t.stage === "down" ? "Down" : "Up"}</div>
        )}
        {t.lastRep && live === "active" && (
          <div className="last-rep">
            Last rep · depth {t.lastRep.depth}° · tempo {t.lastRep.tempo}s
          </div>
        )}
        {t.lastRep?.cue && live === "active" && <div className="cue">{t.lastRep.cue}</div>}
      </div>

      <div className="hud-tr">
        <div className="title">{title}</div>
        <div className="clock">{mmss(elapsedSec(w, now))}</div>
      </div>

      {live === "active" && <div className="up-next">Up next · {upNext}</div>}

      {w.phase === "ready" && (
        <div className="overlay">
          <h1>Get in position</h1>
          <p>Stand 2.5–3 m from the phone with your whole body in frame.</p>
          <div className="bar">
            <div style={{ width: `${w.readySince ? Math.min(100, ((now - w.readySince) / READY_HOLD_MS) * 100) : 0}%` }} />
          </div>
          <p className="muted">{t.visible ? "Hold still…" : "Waiting to see your full body"} · Select to start now</p>
        </div>
      )}

      {w.phase === "rest" && (
        <div className="overlay">
          <p className="muted">Rest</p>
          <div className="countdown">{Math.max(0, Math.ceil(((w.restEndsAt ?? now) - now) / 1000))}</div>
          <p>
            Next: set {w.set + 1} of {plan.sets} · {plan.targetReps} reps
          </p>
          <p className="muted">Select to skip rest</p>
        </div>
      )}

      {w.phase === "paused" && (
        <div className="overlay">
          <h1>Paused</h1>
          <p className="muted">Play/Pause or Select to resume · Back to quit</p>
        </div>
      )}

      {disconnected && (
        <div className="overlay warn">
          <h1>Phone disconnected</h1>
          <p className="muted">Select to re-pair (your progress is kept) · Back to quit</p>
        </div>
      )}

      <div className="hints">
        {live === "active" ? "Select: end set" : ""} · Play/Pause: pause · Back: pause / quit
      </div>
      {props.showDebug && (
        <div className="debug-strip">
          link {link} · msg #{t.seq} {Math.max(0, now - t.lastAt)}ms ago · angle {t.angle}° · phone {t.phoneFps} fps · TV video{" "}
          {v.fps ?? "–"} fps {v.size ?? ""} {v.codec ?? ""} · decoded {v.decoded ?? 0} · lost {v.lost ?? 0}
        </div>
      )}
    </div>
  );
}
