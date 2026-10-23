// Library, laid out like the reference: profile + readiness on the left, program cards, a detail panel for the
// focused program, and a Start Workout bar. The AI coach's "Recommended next" card leads when the agent has planned one.
import { Bot, Camera, ChevronRight, Circle, Cloud, Gauge, Play, ScanEye, Smartphone, Sparkles, Sun, Target, Timer, Wifi } from "lucide-react";
import type { Decision, NextWorkout, ProfileView } from "@firefit/shared";
import { ExerciseIcon } from "../ui";

export type Program = NextWorkout & { title: string; blurb: string; recommended?: boolean; focusCue?: string };

const CHIP: Record<Decision, string> = { progress: "Progress", hold: "Hold", deload: "Deload", technique: "Technique" };
const EX = { squat: "Squats", pushup: "Push-ups" } as const;
const DESC = {
  squat: "Bodyweight squats with depth and knee tracking. Face the phone, whole body in frame.",
  pushup: "Push-ups with elbow depth and hip-line checks. Phone at floor level, side view.",
} as const;

export function Library({ programs, focus, profile }: { programs: Program[]; focus: number; profile?: ProfileView | null }) {
  const p = programs[focus];
  const prof = profile?.profile;
  const name = prof?.name ?? "Guest";
  const metrics = profile?.metrics[p.exercise];
  const recent = profile?.recent ?? [];
  const weekAgo = Date.now() - 7 * 864e5;
  const thisWeek = recent.filter((r) => Date.parse(r.completedAt) > weekAgo).length;

  return (
    <main className="library">
      <aside className="profile glass blur">
        <h3>Your profile</h3>
        <div className="avatar-row">
          <div className="avatar">{name.slice(0, 1).toUpperCase()}</div>
          <div className="name">{name}</div>
        </div>
        <Row icon={<Target size={30} />} label="Goal" value={prof?.goal ?? "Strength + form"} />
        <Row icon={<Gauge size={30} />} label="Level" value={prof?.level ?? "Beginner"} />
        <Row icon={<Camera size={30} />} label="Camera" value="Your phone" />
        <Row icon={<Bot size={30} />} label="Coach" value={prof?.lastDecision ? CHIP[prof.lastDecision] : "Ready"} ok />
        <div className="ready-title">Readiness check</div>
        <div className="muted small">Confirmed live once your phone pairs</div>
        <Check icon={<ScanEye size={30} />} label="Full body visible" />
        <Check icon={<Sun size={30} />} label="Light in front of you" />
        <Check icon={<Wifi size={30} />} label="Same Wi-Fi as the TV" />
      </aside>

      <section className="lib-main">
        <h2>Workout library</h2>
        <div className="cards">
          {programs.map((prog, i) => (
            <div key={prog.title} className={`card glass ${prog.recommended ? "recommended" : prog.exercise}` + (i === focus ? " focused" : "")}>
              <div className="icon">{prog.recommended ? <Sparkles size={38} /> : <ExerciseIcon exercise={prog.exercise} size={38} />}</div>
              {prog.recommended && <div className="badge">Recommended next · AI coach</div>}
              <div className="art">
                <ExerciseIcon exercise={prog.exercise} size={150} />
              </div>
              <h3>{prog.title}</h3>
              <p>
                {prog.sets} × {prog.targetReps} · rest {prog.restSec}s
              </p>
            </div>
          ))}
        </div>

        <div className="detail glass blur">
          <div>
            <div className="detail-head">
              <div className="icon">{p.recommended ? <Sparkles size={42} /> : <ExerciseIcon exercise={p.exercise} size={42} />}</div>
              <div>
                <h3>{p.title}</h3>
                <p className="desc">{p.recommended && p.focusCue ? `Planned by your AI coach. Focus: ${p.focusCue}` : DESC[p.exercise]}</p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span className="pill ok">
                    <Smartphone size={22} /> On-device pose tracking
                  </span>
                  <span className="pill cloud">
                    <Cloud size={22} /> Cloud history
                  </span>
                  {p.recommended && (
                    <span className="pill ai">
                      <Bot size={22} /> AI coach plan
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="plan-list">
              <div className="plan-row">
                <span className="n">1</span>
                <ExerciseIcon exercise={p.exercise} size={30} /> {EX[p.exercise]}
                <span className="v">
                  {p.sets} × {p.targetReps}
                </span>
              </div>
              <div className="plan-row">
                <span className="n">2</span>
                <Timer size={30} /> Rest between sets
                <span className="v">{p.restSec} s</span>
              </div>
              <div className="plan-row">
                <span className="n">3</span>
                <Bot size={30} /> AI coach review
                <span className="v">after the workout</span>
              </div>
            </div>
          </div>

          <div className="side">
            <div className="stat-tiles">
              <Tile v={String(metrics?.sessions ?? 0)} l="Sessions" />
              <Tile v={String(metrics?.bestReps ?? 0)} l="Best reps" />
              <Tile v={String(thisWeek)} l="This week" />
            </div>
            <div>
              <div className="muted small" style={{ marginBottom: 6 }}>
                Recent sessions
              </div>
              {recent.length === 0 && <div className="muted small">No sessions yet. Your first one starts the history.</div>}
              {recent.slice(0, 3).map((r) => (
                <div key={r.id} className="recent-row">
                  <span className="when">{new Date(r.completedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  <span>
                    {EX[r.exercise]} · {r.reps}/{r.sets * r.targetReps}
                  </span>
                  {r.decision && <span className={"chip " + r.decision}>{CHIP[r.decision]}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="start-row">
          <span className="hint">◀ ▶ choose · Select to start · Back to exit</span>
          <div className="start-btn">
            <Play size={34} fill="#fff" /> Start workout <ChevronRight size={34} />
          </div>
        </div>
      </section>
    </main>
  );
}

function Row({ icon, label, value, ok }: { icon: React.ReactNode; label: string; value: string; ok?: boolean }) {
  return (
    <div className="prow">
      {icon}
      {label}
      <span className={"v" + (ok ? " ok" : "")}>{value}</span>
    </div>
  );
}

function Check({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="check">
      <Circle className="no" size={26} />
      {icon}
      {label}
    </div>
  );
}

function Tile({ v, l }: { v: string; l: string }) {
  return (
    <div className="tile">
      <div className="v num">{v}</div>
      <div className="l">{l}</div>
    </div>
  );
}
