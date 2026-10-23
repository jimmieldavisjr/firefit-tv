// Workout HUD over the phone's live video (the skeleton is baked into the frames), laid out like the reference:
// left exercise card with the rep ring, form check, Up next / Then / rest on the right, a live depth or body-line
// meter, and a bottom bar spread across the screen. Calories are a labeled MET estimate.
import { Bot, CircleAlert, CircleCheck, Circle, Dumbbell, Flame, Layers, Pause, ScanEye, SkipForward, Square, Timer } from "lucide-react";
import { EXERCISE_INFO } from "@firefit/shared/programs";
import type { BlockPlan, Stage } from "@firefit/shared";
import { CFG } from "../../phone/repEngine";
import { ExerciseIcon, RepRing, TopBar } from "../ui";
import { BreakScreen } from "./BreakScreen";
import { caloriesEst, current, elapsedSec, isTimed, READY_HOLD_MS, setProgress, setsDone, totalSets, TRANSITION_SEC, type SessionState } from "../workout";

export type Telemetry = {
  stage: Stage;
  angle: number;
  visible: boolean;
  phoneFps: number;
  seq: number;
  lastAt: number;
  good?: boolean;
  cue?: string;
  lastRep?: { depth: number; tempo: number; cue?: string };
};
export type VideoStats = { fps?: number; decoded?: number; codec?: string; size?: string; lost?: number };

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, "0")}`;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const targetText = (b: BlockPlan) => `${b.sets} sets × ${b.target}${isTimed(b) ? " sec" : " reps"}`;
const CUE_HELP: Record<string, string> = {
  "Push your knees out over your toes": "Keep them tracking over your feet",
  "Keep your hips in line": "Shoulders, hips and ankles in one line",
  "Lift your hips a little": "Squeeze your glutes to stop the sag",
  "Lower your hips into a straight line": "Bring your body back to one line",
  "Get into push-up position": "Hands under shoulders, body long",
  "Get into plank position": "Forearms or hands down, body long",
};

export function Workout(props: {
  w: SessionState;
  t: Telemetry;
  v: VideoStats;
  link: string;
  now: number;
  who: string;
  weightKg: number;
  showDebug: boolean;
}) {
  const { w, t, v, link, now } = props;
  const b = current(w);
  const info = EXERCISE_INFO[b.exercise];
  const timed = isTimed(b);
  const cfg = CFG[b.exercise];
  const live = w.phase === "paused" ? w.pausedFrom : w.phase;
  const disconnected = link === "failed" || link === "disconnected" || link === "closed";
  const last = timed ? undefined : t.lastRep;
  const progress = setProgress(w);
  const nextBlock = w.plan[w.block + 1];
  const afterNext = w.plan[w.block + 2];
  const lastSetOfBlock = w.set >= b.sets;
  const restLeft = w.restEndsAt ? Math.max(0, Math.ceil((w.restEndsAt - now) / 1000)) : b.restSec;
  const justFinishedSet = (w.phase === "rest" || w.phase === "transition") && w.restEndsAt !== null && now - (w.restEndsAt - (w.phase === "rest" ? b.restSec : TRANSITION_SEC) * 1000) < 1400;

  // Live meter: descent toward the "down" threshold for reps; body-line straightness for the plank.
  const meter = !t.visible ? 0 : timed ? clamp01((t.angle - 135) / (180 - 135)) : clamp01((cfg.up - t.angle) / (cfg.up - cfg.down));
  const meterTarget = timed ? (cfg.down - 135) / (180 - 135) : 1;
  const meterOk = timed ? !!t.good : t.visible && t.angle <= cfg.down;
  const cue = timed ? (t.good ? undefined : t.cue) : (t.cue ?? last?.cue);

  const exCard = (x: BlockPlan, t: string, s: string) => ({ img: `/img/${x.exercise}-sm.jpg`, icon: <ExerciseIcon exercise={x.exercise} size={40} />, t, s });
  const coachCard = { icon: <Bot size={40} />, t: "AI coach review", s: "Strands agent on Amazon Bedrock" };
  const upNext = !lastSetOfBlock
    ? exCard(b, `${info.plural}: set ${w.set + 1}`, `${b.target}${timed ? " sec" : " reps"} after ${b.restSec}s rest`)
    : nextBlock
      ? exCard(nextBlock, EXERCISE_INFO[nextBlock.exercise].plural, targetText(nextBlock))
      : coachCard;
  const then = lastSetOfBlock
    ? afterNext
      ? exCard(afterNext, EXERCISE_INFO[afterNext.exercise].plural, targetText(afterNext))
      : nextBlock
        ? coachCard
        : { icon: <Bot size={40} />, t: "Your next session", s: "Planned by the coach" }
    : nextBlock
      ? exCard(nextBlock, EXERCISE_INFO[nextBlock.exercise].plural, targetText(nextBlock))
      : coachCard;

  return (
    <div className="workout">
      <TopBar step="Workout" who={props.who} />

      {/* Left: current exercise + ring */}
      <section className="w-left glass strong rep-card">
        <div className="rc-kicker">
          Exercise {w.block + 1} of {w.plan.length}
        </div>
        <div className="rc-title">
          <span className="rc-icon">
            <ExerciseIcon exercise={b.exercise} size={30} />
          </span>
          {info.name}
        </div>
        <div className="rc-sub">
          Set {Math.min(w.set, b.sets)} of {b.sets}
        </div>
        <div className={"rc-ring" + (!timed && last ? (last.cue ? " cue" : last.depth <= cfg.down ? " good" : "") : "")}>
          <RepRing
            id="repRing"
            size={264}
            p={progress / b.target}
            segments={timed ? 1 : b.target}
            live={live === "active" && !timed ? meter : undefined}
            color={timed ? (t.good ? ["#34d399", "#86efac"] : ["#f59e0b", "#fcd34d"]) : ["#3b9cff", "#ff9a3c"]}
          />
          <div className="rc-center">
            <span className="rc-n num" key={timed ? "t" : progress}>
              {timed ? mmss(progress) : progress}
            </span>
            <span className="rc-of">{timed ? `of ${mmss(b.target)}` : `of ${b.target} reps`}</span>
          </div>
        </div>
        <div className="rc-metrics">
          {timed ? (
            <>
              <Stat2 v={`${t.angle}°`} l="Body line" state={t.good ? "ok" : "warn"} />
              <Stat2 v={t.good ? "Hold" : "Fix"} l="Status" />
            </>
          ) : (
            <>
              <Stat2 v={last ? `${last.depth}°` : "–"} l="Depth" state={last ? (last.depth <= cfg.down ? "ok" : "warn") : undefined} />
              <Stat2 v={last ? `${last.tempo}s` : "–"} l="Tempo" />
            </>
          )}
        </div>
      </section>

      {/* Form check: only what the camera measures */}
      <section className="w-form glass strong">
        <h3>Form check</h3>
        {b.exercise === "plank" ? (
          <>
            <FormRow label="Body line" state={!t.visible || live !== "active" ? "idle" : t.good ? "ok" : "warn"} val={t.visible ? `${t.angle}°` : ""} />
            <FormRow label="Hips" state={!t.visible || live !== "active" ? "idle" : t.good ? "ok" : "warn"} />
            <FormRow label="Hold" state={progress > 0 ? "ok" : "idle"} val={`${progress}s`} />
          </>
        ) : (
          <>
            <FormRow label="Depth" state={last ? (last.depth <= cfg.down ? "ok" : "warn") : "idle"} val={last ? `${last.depth}°` : ""} />
            <FormRow label={b.exercise === "squat" ? "Knee alignment" : "Hip line"} state={last ? (last.cue ? "warn" : "ok") : "idle"} />
            <FormRow label="Tempo" state={last ? (last.tempo >= 1 && last.tempo <= 4.5 ? "ok" : "warn") : "idle"} val={last ? `${last.tempo}s` : ""} />
          </>
        )}
        <FormRow label="Tracking" state={live !== "active" ? "idle" : t.visible ? "ok" : "warn"} val={live === "active" && !t.visible ? "lost" : ""} />
      </section>

      {/* Right column */}
      <aside className="w-right">
        <NextCard title="Up next" {...upNext} />
        <NextCard title="Then" {...then} />
      </aside>

      {live === "active" && cue && (
        <div className="cue-bubble" key={cue}>
          <CircleAlert size={34} />
          <div>
            <div className="t">{cue}</div>
            <div className="s">{CUE_HELP[cue] ?? "Watch your form on the next rep"}</div>
          </div>
        </div>
      )}

      {live === "active" && (
        <div className="depth-meter glass strong">
          <div className="depth-track">
            <div className="depth-fill" style={{ width: `${meter * 100}%` }} />
            <div className="depth-target" style={{ left: `calc(${meterTarget * 100}% - 4px)` }} />
          </div>
          <div className={"depth-label" + (meterOk ? "" : " idle")}>
            {meterOk ? (
              <>
                <CircleCheck className="ok" size={30} /> {timed ? "Straight line!" : "Good depth!"}
              </>
            ) : timed ? (
              "Straighten your body"
            ) : meter > 0.15 ? (
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


      {/* Bottom bar, spread across the screen */}
      <footer className="w-bottom glass strong">
        <Metric icon={<Flame size={44} className="fire" />} v={`${caloriesEst(w, now, props.weightKg)}`} l="Calories (est.)" />
        <Metric icon={<Timer size={44} />} v={mmss(elapsedSec(w, now))} l="Workout time" />
        <Metric icon={<Dumbbell size={44} />} v={`${setsDone(w)} / ${totalSets(w)}`} l="Sets complete" />
        <Metric icon={<Layers size={44} />} v={`${w.block + 1} / ${w.plan.length}`} l={info.plural} />
        <div className="end-btn">
          {w.phase === "rest" || w.phase === "transition" ? <SkipForward size={30} /> : w.phase === "paused" ? <Pause size={30} /> : <Square size={26} fill="#fff" />}
          {w.phase === "rest" ? "Skip Rest" : w.phase === "transition" ? "I'm Ready" : w.phase === "ready" ? "Start Now" : w.phase === "paused" ? "Resume" : "End Set"}
          <span className="k">Select</span>
        </div>
      </footer>

      {w.phase === "ready" && (
        <div className="overlay glass strong">
          <div className="ov-icon">
            <ExerciseIcon exercise={b.exercise} size={56} />
          </div>
          <h1>{info.plural}</h1>
          <p>{info.camera}.</p>
          <div className="bar">
            <div style={{ width: `${w.readySince ? Math.min(100, ((now - w.readySince) / READY_HOLD_MS) * 100) : 0}%` }} />
          </div>
          <p className="muted">{t.visible ? "Hold still…" : "Waiting to see your full body"} · Select to start now</p>
        </div>
      )}

      {(live === "rest" || live === "transition") && (
        <BreakScreen
          kind={live}
          left={restLeft}
          total={live === "rest" ? b.restSec : TRANSITION_SEC}
          next={live === "rest" ? b : (nextBlock ?? b)}
          nextSet={live === "rest" ? w.set + 1 : 1}
          finishedSet={justFinishedSet}
        />
      )}

      {w.phase === "paused" && (
        <div className="overlay compact glass strong">
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

function NextCard({ title, icon, t, s, img }: { title: string; icon: React.ReactNode; t: string; s: string; img?: string }) {
  return (
    <div className="glass strong">
      <h3>{title}</h3>
      {img && <img className="next-img" src={img} alt="" />}
      <div className="next-card">
        <div className="icon">{icon}</div>
        <div>
          <div className="t">{t}</div>
          <div className="s">{s}</div>
        </div>
      </div>
    </div>
  );
}

function Stat2({ v, l, state }: { v: string; l: string; state?: "ok" | "warn" }) {
  return (
    <div className="rc-stat">
      <div className="v num">
        {v}
        {state === "ok" && <CircleCheck className="ok" size={26} />}
        {state === "warn" && <CircleAlert className="warn" size={26} />}
      </div>
      <div className="l">{l}</div>
    </div>
  );
}

function Metric({ icon, v, l }: { icon: React.ReactNode; v: string; l: string }) {
  return (
    <div className="m">
      {icon}
      <div>
        <div className="v num">{v}</div>
        <div className="l">{l}</div>
      </div>
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
