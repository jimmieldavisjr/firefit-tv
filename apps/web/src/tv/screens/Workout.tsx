// Workout HUD over the phone's live video (the skeleton is baked into the frames), laid out like the reference:
// left exercise card with the rep ring, form check, Up Next / rest on the right, depth meter, bottom stats bar.
// Only measured values are shown: no calories or heart rate (the camera can't measure them).
import { Bot, CircleAlert, CircleCheck, Circle, Dumbbell, Pause, Repeat, ScanEye, SkipForward, Square, Timer } from "lucide-react";
import type { Stage } from "@firefit/shared";
import { CFG } from "../../phone/repEngine";
import { ExerciseIcon, Ring, TopBar } from "../ui";
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
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const NAME = { squat: "Squat", pushup: "Push-Up" } as const;
const ALIGN = { squat: "Knee alignment", pushup: "Hip line" } as const;
const CUE_HELP: Record<string, string> = {
  "Push your knees out over your toes": "Keep them tracking over your feet",
  "Keep your hips in line": "Shoulders, hips and ankles in one line",
};

export function Workout(props: {
  w: WorkoutState;
  t: Telemetry;
  v: VideoStats;
  link: string;
  now: number;
  showDebug: boolean;
}) {
  const { w, t, v, link, now } = props;
  const { plan } = w;
  const cfg = CFG[plan.exercise];
  const live = w.phase === "paused" ? w.pausedFrom : w.phase;
  const disconnected = link === "failed" || link === "disconnected" || link === "closed";
  const last = t.lastRep;
  const totalReps = w.repsBySet.reduce((a, b) => a + b, 0) + (live === "active" ? w.setReps : 0);
  const depths = w.perRep.map((r) => r.depth);
  const avgDepth = depths.length ? Math.round(depths.reduce((a, b) => a + b, 0) / depths.length) : null;
  // Live descent progress from the 10 Hz knee/elbow angle: 0 standing tall, 1 at the "down" threshold.
  const descent = t.visible ? clamp01((cfg.up - t.angle) / (cfg.up - cfg.down)) : 0;
  const atDepth = t.visible && t.angle <= cfg.down;
  const goodLast = last ? last.depth <= cfg.down && !last.cue : false;
  const restLeft = w.restEndsAt ? Math.max(0, Math.ceil((w.restEndsAt - now) / 1000)) : plan.restSec;
  const justFinishedSet = w.phase === "rest" && w.restEndsAt !== null && now - (w.restEndsAt - plan.restSec * 1000) < 1400;
  const lastSet = w.set >= plan.sets;

  return (
    <div className="workout">
      <TopBar step="Workout" />

      {/* Left: current exercise + rep ring */}
      <section className="w-left glass strong">
        <div className="label">Current exercise</div>
        <div className="ex-row">
          <ExerciseIcon exercise={plan.exercise} size={64} />
          <div>
            <div className="name">{NAME[plan.exercise]}</div>
            <div className="set">
              Set {Math.min(w.set, plan.sets)} of {plan.sets}
            </div>
          </div>
        </div>
        <div className={"ring-wrap" + (w.setReps ? " pulse " + (goodLast ? "good" : last?.cue ? "cue" : "") : "")} key={`${w.set}-${w.setReps}`}>
          <div className="glow" />
          <Ring id="repRing" size={300} stroke={22} p={w.setReps / plan.targetReps} ticks={plan.targetReps} filledTicks={w.setReps} live={live === "active" ? descent : undefined} />
          <div className="ring-center">
            <span className="ring-n num">{w.setReps}</span>
            <span className="ring-d">/ {plan.targetReps} reps</span>
          </div>
        </div>
        <div className="w-time">
          <div className="v num">{mmss(elapsedSec(w, now))}</div>
          <div className="l">Workout time</div>
        </div>
        <div className="w-metrics">
          <div>
            <div className="v num">
              {last ? `${last.depth}°` : "–"}
              {last && (last.depth <= cfg.down ? <CircleCheck className="ok" size={34} /> : <CircleAlert className="warn" size={34} />)}
            </div>
            <div className="l">Depth</div>
          </div>
          <div>
            <div className="v num">{last ? `${last.tempo}s` : "–"}</div>
            <div className="l">Tempo</div>
          </div>
        </div>
      </section>

      {/* Form check: only what the camera measures */}
      <section className="w-form glass strong">
        <h3>Form check</h3>
        <FormRow label="Depth" state={last ? (last.depth <= cfg.down ? "ok" : "warn") : "idle"} val={last ? `${last.depth}°` : ""} />
        <FormRow label={ALIGN[plan.exercise]} state={last ? (last.cue ? "warn" : "ok") : "idle"} />
        <FormRow label="Tempo" state={last ? (last.tempo >= 1 && last.tempo <= 4.5 ? "ok" : "warn") : "idle"} val={last ? `${last.tempo}s` : ""} />
        <FormRow label="Tracking" state={live !== "active" ? "idle" : t.visible ? "ok" : "warn"} val={live === "active" && !t.visible ? "lost" : ""} />
      </section>

      {/* Right column: up next, then, rest */}
      <aside className="w-right">
        <div className="glass strong">
          <h3>Up next</h3>
          <div className="next-card">
            <div className="icon">{lastSet ? <Bot size={44} /> : <Repeat size={44} />}</div>
            <div>
              <div className="t">{lastSet ? "AI coach review" : `Set ${w.set + 1} of ${plan.sets}`}</div>
              <div className="s">{lastSet ? "Strands agent on Amazon Bedrock" : `${plan.targetReps} reps after rest`}</div>
            </div>
          </div>
        </div>
        <div className="glass strong">
          <h3>Then</h3>
          <div className="next-card">
            <div className="icon">
              <Dumbbell size={44} />
            </div>
            <div>
              <div className="t">Your next workout</div>
              <div className="s">Planned by the coach from this session</div>
            </div>
          </div>
        </div>
        <div className="glass strong rest-card">
          <div className="rest-ring">
            <Ring id="restRing" size={150} stroke={10} p={w.phase === "rest" ? restLeft / plan.restSec : 1} from="#3b9cff" to="#3b9cff" />
            <div className="v num">{mmss(restLeft)}</div>
          </div>
          <div>
            <div className="t">{w.phase === "rest" ? "Resting" : "Rest after set"}</div>
            <div className="s">{lastSet && w.phase !== "rest" ? "Last set: finish strong" : `Get ready for set ${Math.min(w.set + 1, plan.sets)}`}</div>
          </div>
        </div>
      </aside>

      {/* Cue callout near the body */}
      {live === "active" && last?.cue && (
        <div className="cue-bubble" key={`${w.perRep.length}-${last.cue}`}>
          <CircleAlert size={34} />
          <div>
            <div className="t">{last.cue}</div>
            <div className="s">{CUE_HELP[last.cue] ?? "Watch your form on the next rep"}</div>
          </div>
        </div>
      )}

      {/* Live depth meter */}
      {live === "active" && (
        <div className="depth-meter glass strong">
          <div className="depth-track">
            <div className="depth-fill" style={{ width: `${descent * 100}%` }} />
            <div className="depth-target" style={{ left: "calc(100% - 4px)" }} />
          </div>
          <div className={"depth-label" + (atDepth ? "" : " idle")}>
            {atDepth ? (
              <>
                <CircleCheck className="ok" size={30} /> Good depth!
              </>
            ) : descent > 0.15 ? (
              "Go a little lower"
            ) : (
              "Stand tall, then go"
            )}
          </div>
        </div>
      )}

      {live === "active" && t.stage === "lost" && (
        <div className="lost-banner">
          <ScanEye size={30} /> Step into frame
        </div>
      )}

      {justFinishedSet && <div className="set-done">Set {w.set} complete!</div>}

      {/* Bottom stats bar */}
      <footer className="w-bottom glass strong">
        <div className="m">
          <Timer size={44} />
          <div>
            <div className="v num">{mmss(elapsedSec(w, now))}</div>
            <div className="l">Workout time</div>
          </div>
        </div>
        <div className="m">
          <Dumbbell size={44} />
          <div>
            <div className="v num">
              {w.repsBySet.length} / {plan.sets}
            </div>
            <div className="l">Sets complete</div>
          </div>
        </div>
        <div className="m">
          <Repeat size={44} />
          <div>
            <div className="v num">{totalReps}</div>
            <div className="l">Total reps</div>
          </div>
        </div>
        <div className="m">
          <CircleCheck size={44} />
          <div>
            <div className="v num">{avgDepth !== null ? `${avgDepth}°` : "–"}</div>
            <div className="l">Avg depth</div>
          </div>
        </div>
        <div className="end-btn">
          {w.phase === "rest" ? <SkipForward size={30} /> : w.phase === "paused" ? <Pause size={30} /> : <Square size={26} fill="#fff" />}
          {w.phase === "rest" ? "Skip Rest" : w.phase === "ready" ? "Start Now" : w.phase === "paused" ? "Resume" : "End Set"}
          <span className="k">Select</span>
        </div>
      </footer>

      {w.phase === "ready" && (
        <div className="overlay glass strong">
          <h1>Get in position</h1>
          <p>Stand 2.5–3 m from the phone with your whole body in frame.</p>
          <div className="bar">
            <div style={{ width: `${w.readySince ? Math.min(100, ((now - w.readySince) / READY_HOLD_MS) * 100) : 0}%` }} />
          </div>
          <p className="muted">{t.visible ? "Hold still…" : "Waiting to see your full body"} · Select to start now</p>
        </div>
      )}

      {w.phase === "rest" && !justFinishedSet && (
        <div className="overlay glass strong">
          <p className="muted">Rest</p>
          <div className="countdown num">{restLeft}</div>
          <p>
            Next: set {w.set + 1} of {plan.sets} · {plan.targetReps} reps
          </p>
          <p className="muted">Select to skip rest</p>
        </div>
      )}

      {w.phase === "paused" && (
        <div className="overlay glass strong">
          <h1>Paused</h1>
          <p className="muted">Play/Pause or Select to resume · Back to quit</p>
        </div>
      )}

      {disconnected && (
        <div className="overlay glass strong warn">
          <h1>Phone disconnected</h1>
          <p className="muted">Select to re-pair (your progress is kept) · Back to quit</p>
        </div>
      )}

      {props.showDebug && (
        <div className="debug-strip">
          link {link} · msg #{t.seq} {Math.max(0, now - t.lastAt)}ms ago · angle {t.angle}° · phone {t.phoneFps} fps · TV video{" "}
          {v.fps ?? "–"} fps {v.size ?? ""} {v.codec ?? ""} · decoded {v.decoded ?? 0} · lost {v.lost ?? 0}
        </div>
      )}
    </div>
  );
}

function FormRow({ label, state, val }: { label: string; state: "ok" | "warn" | "idle"; val?: string }) {
  return (
    <div className="row">
      {state === "ok" ? <CircleCheck className="ok" size={32} /> : state === "warn" ? <CircleAlert className="warn" size={32} /> : <Circle className="idle" size={32} />}
      {label}
      {val && <span className="val num">{val}</span>}
    </div>
  );
}
