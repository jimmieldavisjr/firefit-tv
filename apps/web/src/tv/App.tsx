// Fire TV app root. Block 3 replaces this with the workout state machine
// (LIBRARY -> PAIR -> READY -> ACTIVE -> REST -> COMPLETE) and the screens in ./screens.
import { useEffect, useState } from "react";
import { PROGRAMS } from "@firefit/shared/programs";

const programs = Object.values(PROGRAMS);

export function App() {
  const [focus, setFocus] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setFocus((f) => Math.min(programs.length - 1, f + 1));
      if (e.key === "ArrowLeft") setFocus((f) => Math.max(0, f - 1));
    };
    const onBack = () => window.FireFitHost?.exit(); // library is the root screen: Back leaves the app
    window.addEventListener("keydown", onKey);
    window.addEventListener("tv-back", onBack);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("tv-back", onBack);
    };
  }, []);

  return (
    <main className="library">
      <h1 className="logo">
        fire<span>fit</span>
      </h1>
      <h2>Workout Library</h2>
      <div className="cards">
        {programs.map((p, i) => (
          <div key={p.exercise} className={"card" + (i === focus ? " focused" : "")}>
            <h3>{p.title}</h3>
            <p>
              {p.sets} × {p.targetReps} · {p.blurb}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
