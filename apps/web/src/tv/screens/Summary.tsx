// COMPLETE: stats immediately, then the coach plan once the Strands agent (or the labeled rules fallback) writes it.
import { Bot, CircleCheck, Crosshair, Repeat, Timer, Waves, Dumbbell } from "lucide-react";
import type { CoachPlan, WorkoutInput } from "@firefit/shared";

export type CoachState = { status: "saving" | "thinking" | "ready" | "unavailable" | "error"; plan?: CoachPlan; error?: string };

const DECISION_LABEL: Record<CoachPlan["decision"], string> = {
  progress: "Progress",
  hold: "Hold",
  deload: "Deload",
  technique: "Technique focus",
};

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`;

export function Summary({ title, w, coach }: { title: string; w: WorkoutInput; coach: CoachState }) {
  const plan = coach.plan;
  return (
    <main className="summary">
      <h2>
        <CircleCheck size={52} /> {title}: complete
      </h2>
      <div className="stats">
        <Stat icon={<Repeat size={34} />} label="Reps" value={`${w.reps} / ${w.sets * w.targetReps}`} />
        <Stat icon={<Dumbbell size={34} />} label="Sets" value={String(w.sets)} />
        <Stat icon={<Timer size={34} />} label="Time" value={mmss(w.durationSec)} />
        <Stat icon={<Crosshair size={34} />} label="Avg depth" value={w.avgDepthDeg ? `${w.avgDepthDeg}°` : "–"} />
        <Stat icon={<Waves size={34} />} label="Avg tempo" value={w.avgTempoSec ? `${w.avgTempoSec}s` : "–"} />
      </div>

      <section className="coach glass blur">
        <div className="coach-head">
          <div className="icon">
            <Bot size={36} />
          </div>
          <h3>Your coach</h3>
          {plan && (
            <span className={"pill " + (plan.source === "agent" ? "ai" : "cloud")}>
              {plan.source === "agent" ? "AI coach · Strands agent on Amazon Bedrock" : "Rules fallback (AI unavailable)"}
            </span>
          )}
        </div>
        {coach.status === "saving" && (
          <p className="status">
            <span className="spinner" /> Saving your workout…
          </p>
        )}
        {coach.status === "thinking" && (
          <p className="status">
            <span className="spinner" /> Saved. The coach is reviewing your history…
          </p>
        )}
        {coach.status === "unavailable" && <p className="muted">Saved. The coach didn't answer in time; your plan will appear in the library.</p>}
        {coach.status === "error" && <p className="warn-text">Couldn't save this workout: {coach.error}</p>}
        {plan && (
          <>
            <div className="decision-row">
              <span className={"chip " + plan.decision}>{DECISION_LABEL[plan.decision]}</span>
              <span className="next">
                Next: {plan.nextWorkout.sets} × {plan.nextWorkout.targetReps} {plan.nextWorkout.exercise === "squat" ? "squats" : "push-ups"} · rest{" "}
                {plan.nextWorkout.restSec}s
              </span>
            </div>
            <p className="recap">{plan.recap}</p>
            <p className="focus">
              <Crosshair size={30} /> Focus cue: {plan.focusCue}
            </p>
            <p className="muted small">
              Why: {plan.reason}
              {plan.source === "agent" && ` · tools: ${plan.toolCalls.join(", ")} · ${(plan.latencyMs / 1000).toFixed(1)}s`}
            </p>
          </>
        )}
      </section>
      <p className="hint">Select: back to the library, where your next workout is waiting</p>
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="stat glass blur">
      <div className="muted">{icon}</div>
      <div className="stat-v num">{value}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}
