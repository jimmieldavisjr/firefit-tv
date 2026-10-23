import type { Decision, NextWorkout, ProfileView } from "@firefit/shared";

export type Program = NextWorkout & { title: string; blurb: string; recommended?: boolean; focusCue?: string };

const CHIP: Record<Decision, string> = { progress: "Progress", hold: "Hold", deload: "Deload", technique: "Technique" };

export function Library({ programs, focus, profile }: { programs: Program[]; focus: number; profile?: ProfileView | null }) {
  const recent = profile?.recent ?? [];
  return (
    <main className="library">
      <h1 className="logo">
        fire<span>fit</span>
      </h1>
      <h2>Workout Library</h2>
      <div className="cards">
        {programs.map((p, i) => (
          <div key={p.title} className={"card" + (i === focus ? " focused" : "") + (p.recommended ? " recommended" : "")}>
            {p.recommended && <div className="badge">Recommended next · by your AI coach</div>}
            <h3>{p.title}</h3>
            <p>
              {p.sets} × {p.targetReps} · rest {p.restSec}s
            </p>
            <p className="blurb">{p.recommended && p.focusCue ? `Focus: ${p.focusCue}` : p.blurb}</p>
          </div>
        ))}
      </div>
      {recent.length > 0 && (
        <section className="recent">
          <h3>Recent sessions</h3>
          {recent.slice(0, 3).map((r) => (
            <div key={r.id} className="recent-row">
              <span>{new Date(r.completedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              <span>
                {r.exercise === "squat" ? "Squats" : "Push-ups"} · {r.reps}/{r.sets * r.targetReps} reps
              </span>
              {r.decision && <span className={"chip " + r.decision}>{CHIP[r.decision]}</span>}
            </div>
          ))}
        </section>
      )}
      <p className="hint">Select to start · Back to exit</p>
    </main>
  );
}
