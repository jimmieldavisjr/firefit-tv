import type { NextWorkout } from "@firefit/shared";

export type Program = NextWorkout & { title: string; blurb: string };

export function Library({ programs, focus }: { programs: Program[]; focus: number }) {
  return (
    <main className="library">
      <h1 className="logo">
        fire<span>fit</span>
      </h1>
      <h2>Workout Library</h2>
      <div className="cards">
        {programs.map((p, i) => (
          <div key={p.title} className={"card" + (i === focus ? " focused" : "")}>
            <h3>{p.title}</h3>
            <p>
              {p.sets} × {p.targetReps} · {p.blurb}
            </p>
          </div>
        ))}
      </div>
      <p className="hint">Select to start · Back to exit</p>
    </main>
  );
}
