// COMPLETE: an in-depth session breakdown on the left, and the AI coach on the right as a live chat transcript:
// status lines, tool calls and the agent's streamed analysis, ending in the plan for the next session.
// Remote Up/Down scrolls the coach panel.
import { useEffect, useRef } from "react";
import { Bot, CircleCheck, Clock, Flame, Layers, Sparkles, Timer, Wrench } from "lucide-react";
import { EXERCISE_INFO } from "@firefit/shared/programs";
import type { BlockResult, CoachRun, Decision, WorkoutInput } from "@firefit/shared";
import { ExerciseIcon } from "../ui";

export type CoachState = { status: "saving" | "waiting" | "running" | "done" | "unavailable" | "error"; run?: CoachRun; error?: string };

const DECISION: Record<Decision, string> = { progress: "Progress", hold: "Hold", deload: "Deload", technique: "Technique focus" };
const TOOL_LABEL: Record<string, string> = {
  get_profile: "Read your profile",
  get_workout_history: "Read your workout history",
  analyze_trends: "Analyzed this session's numbers",
};
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function intervals(b: BlockResult) {
  const out: number[] = [];
  for (let i = 1; i < b.perRep.length; i++) {
    const a = b.perRep[i - 1].at, c = b.perRep[i].at;
    if (a !== undefined && c !== undefined && c > a) out.push((c - a) / 1000);
  }
  return out;
}

export function Summary({ w, coach, scroll }: { w: WorkoutInput; coach: CoachState; scroll: number }) {
  const run = coach.run;
  const chatRef = useRef<HTMLDivElement>(null);
  const sets = w.blocks.reduce((a, b) => a + b.setsDone, 0);
  const planned = w.blocks.reduce((a, b) => a + b.sets, 0);

  const follow = `${run?.transcript?.length}:${run?.transcript?.at(-1)?.text.length}:${run?.status}`;
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight; // follow the agent as it writes
  }, [follow]);
  useEffect(() => {
    chatRef.current?.scrollBy({ top: scroll * 120, behavior: "smooth" });
  }, [scroll]);

  return (
    <main className="summary2">
      <section className="sum-left">
        <h2>
          <CircleCheck size={52} /> Workout complete
        </h2>
        <div className="stats">
          <Stat icon={<Clock size={30} />} label="Total time" value={mmss(w.durationSec)} />
          <Stat icon={<Timer size={30} />} label="Time in sets" value={mmss(w.activeSec)} />
          <Stat icon={<Flame size={30} className="fire" />} label={`Calories (est., ${w.bodyWeightKg} kg)`} value={String(w.caloriesEst)} />
          <Stat icon={<Layers size={30} />} label="Sets" value={`${sets} / ${planned}`} />
        </div>
        <div className="ex-list">
          {w.blocks.map((b) => (
            <ExerciseRow key={b.exercise} b={b} />
          ))}
        </div>
        <p className="hint">Select: back to the library, where your next workout is waiting · Up/Down scrolls the coach</p>
      </section>

      <section className="coach-chat glass">
        <header className="chat-head">
          <div className="icon">
            <Bot size={36} />
          </div>
          <div>
            <h3>Your AI coach</h3>
            <div className="muted small">Reviews every rep your phone measured. It never sees your video.</div>
          </div>
          {run?.source && <span className={"pill " + (run.source === "agent" ? "ai" : "cloud")}>{run.source === "agent" ? "Strands agent · Amazon Bedrock" : "Rules fallback"}</span>}
        </header>
        <div className="chat-body" ref={chatRef}>
          {coach.status === "saving" && <Line kind="status" text="Saving your workout…" live />}
          {coach.status === "waiting" && <Line kind="status" text="Saved. Waking up your coach…" live />}
          {coach.status === "error" && <Line kind="status" text={`Couldn't save this workout: ${coach.error}`} />}
          {coach.status === "unavailable" && <Line kind="status" text="The coach didn't answer in time. Your plan will appear in the library." />}
          {run?.transcript?.map((l, i) => (
            <Line key={i} kind={l.kind} text={l.kind === "tool" ? (TOOL_LABEL[l.text] ?? l.text) : l.text} live={run.status === "running" && i === run.transcript.length - 1} />
          ))}
          {run?.status === "done" && run.decision && run.next && (
            <div className="plan-card">
              <div className="decision-row">
                <span className={"chip " + run.decision}>{DECISION[run.decision]}</span>
                <span className="next">Your next session</span>
              </div>
              <div className="next-blocks">
                {run.next.blocks.map((b) => (
                  <div key={b.exercise} className="nb">
                    <ExerciseIcon exercise={b.exercise} size={30} />
                    <span>{EXERCISE_INFO[b.exercise].plural}</span>
                    <b className="num">
                      {b.sets} × {b.target}
                      {EXERCISE_INFO[b.exercise].unit === "sec" ? " s" : ""}
                    </b>
                  </div>
                ))}
              </div>
              {!!run.insights?.length && (
                <ul className="insights">
                  {run.insights.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              )}
              <p className="focus">
                <Sparkles size={26} /> Focus cue: {run.focusCue}
              </p>
              {run.source === "agent" && run.toolCalls && (
                <p className="muted small">
                  {run.toolCalls.length} tool calls · {((run.latencyMs ?? 0) / 1000).toFixed(1)}s · {run.model}
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function ExerciseRow({ b }: { b: BlockResult }) {
  const info = EXERCISE_INFO[b.exercise];
  const timed = info.unit === "sec";
  const iv = intervals(b);
  const total = b.perSet.reduce((a, n) => a + n, 0);
  const maxIv = Math.max(1, ...iv);
  return (
    <div className="ex-row2 glass">
      <div className="ex-icon">
        <ExerciseIcon exercise={b.exercise} size={40} />
      </div>
      <div className="ex-main">
        <div className="ex-title">
          {info.plural}
          <span className="muted">
            {total} / {b.sets * b.target}
            {timed ? " s" : " reps"}
          </span>
        </div>
        <div className="set-chips">
          {b.perSet.map((n, i) => (
            <span key={i} className={"set-chip" + (n >= b.target ? " met" : "")}>
              {timed ? `${n}s` : n}
            </span>
          ))}
          {b.cues.length > 0 && <span className="cue-count">{b.cues.length} form cue{b.cues.length > 1 ? "s" : ""}</span>}
        </div>
      </div>
      <div className="ex-stats">
        {timed ? (
          <>
            <Mini v={`${Math.round(avg(b.perSet))}s`} l="Avg hold" />
            <Mini v={b.setSec.length ? `${Math.round(avg(b.setSec))}s` : "–"} l="Avg set" />
          </>
        ) : (
          <>
            <Mini v={iv.length ? `${avg(iv).toFixed(1)}s` : "–"} l="Between reps" />
            <Mini v={b.perRep.length ? `${avg(b.perRep.map((r) => r.tempo)).toFixed(1)}s` : "–"} l="Avg tempo" />
            <Mini v={b.perRep.length ? `${Math.round(avg(b.perRep.map((r) => r.depth)))}°` : "–"} l="Avg depth" />
          </>
        )}
      </div>
      {!timed && iv.length > 1 && (
        <svg className="spark" width="150" height="56" viewBox="0 0 150 56" aria-label="seconds between reps">
          {iv.slice(0, 30).map((s, i, arr) => {
            const bw = 150 / arr.length;
            const h = Math.max(4, (s / maxIv) * 52);
            return <rect key={i} x={i * bw + 1} y={56 - h} width={Math.max(2, bw - 2)} height={h} rx={2} fill="rgba(124,192,255,0.8)" />;
          })}
        </svg>
      )}
    </div>
  );
}

function Line({ kind, text, live }: { kind: "status" | "tool" | "text"; text: string; live?: boolean }) {
  if (kind === "tool")
    return (
      <div className="msg tool">
        <Wrench size={22} /> {text}
        <CircleCheck size={22} className="ok" />
      </div>
    );
  if (kind === "status")
    return (
      <div className="msg status">
        {live && <span className="spinner" />} {text}
      </div>
    );
  return (
    <div className="msg text">
      {text}
      {live && <span className="caret" />}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="stat glass">
      <div className="muted">{icon}</div>
      <div className="stat-v num">{value}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}

function Mini({ v, l }: { v: string; l: string }) {
  return (
    <div className="mini">
      <div className="v num">{v}</div>
      <div className="l">{l}</div>
    </div>
  );
}
