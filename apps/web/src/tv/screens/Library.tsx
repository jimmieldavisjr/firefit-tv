// Library: one session (squats, push-ups, plank), laid out like the reference. Profile + readiness on the left,
// the three exercise cards, the plan list with estimated time, recent sessions, and Start workout.
// When the AI coach has planned the next session, its targets and focus cue are what Start uses.
import { Bot, Camera, ChevronRight, Circle, Clock, Cloud, Flame, Gauge, Play, ScanEye, Smartphone, Sparkles, Sun, Target, Timer, Weight, Wifi } from "lucide-react";
import { EXERCISE_INFO } from "@firefit/shared/programs";
import type { BlockPlan, Decision, ProfileView } from "@firefit/shared";
import { ExerciseIcon, initials } from "../ui";
import { TRANSITION_SEC } from "../workout";

const CHIP: Record<Decision, string> = { progress: "Progress", hold: "Hold", deload: "Deload", technique: "Technique" };

/** Rough session length: ~3 s per rep, the plank's hold time, rests and phone moves between exercises. */
export function estimateMin(blocks: BlockPlan[]) {
  const sec = blocks.reduce((a, b) => a + b.sets * (EXERCISE_INFO[b.exercise].unit === "sec" ? b.target + 8 : b.target * 3 + 8) + (b.sets - 1) * b.restSec, 0);
  return Math.round((sec + (blocks.length - 1) * TRANSITION_SEC) / 60);
}

export function Library({ blocks, fromCoach, profile }: { blocks: BlockPlan[]; fromCoach: boolean; profile?: ProfileView | null }) {
  const prof = profile?.profile;
  const name = prof?.name ?? "Guest";
  const recent = profile?.recent ?? [];
  const weekAgo = Date.now() - 7 * 864e5;
  const thisWeek = recent.filter((r) => Date.parse(r.completedAt) > weekAgo).length;

  return (
    <main className="library">
      <aside className="profile glass">
        <h3>Your profile</h3>
        <div className="avatar-row">
          <div className="avatar">{initials(name)}</div>
          <div className="name">{name}</div>
        </div>
        <Row icon={<Target size={30} />} label="Goal" value={prof?.goal ?? "Strength + form"} />
        <Row icon={<Gauge size={30} />} label="Level" value={prof?.level ?? "Beginner"} />
        <Row icon={<Weight size={30} />} label="Weight" value={`${prof?.weightKg ?? 80} kg`} />
        <Row icon={<Camera size={30} />} label="Camera" value="Your phone" />
        <Row icon={<Bot size={30} />} label="Coach" value={prof?.lastDecision ? CHIP[prof.lastDecision] : "Ready"} ok />
        <div className="ready-title">Readiness check</div>
        <div className="muted small">Confirmed live once your phone pairs</div>
        <Check icon={<ScanEye size={30} />} label="Full body visible" />
        <Check icon={<Sun size={30} />} label="Light in front of you" />
        <Check icon={<Wifi size={30} />} label="Same Wi-Fi as the TV" />
      </aside>

      <section className="lib-main">
        <div className="lib-head">
          <h2>Today's workout</h2>
          {fromCoach ? (
            <span className="pill ai">
              <Sparkles size={22} /> Planned by your AI coach
            </span>
          ) : (
            <span className="pill cloud">
              <Cloud size={22} /> Starter plan
            </span>
          )}
        </div>
        <div className="cards">
          {blocks.map((b, i) => (
            <div key={b.exercise} className={`card glass ${b.exercise}` + (i === 0 ? " focused" : "")}>
              <div className="icon">
                <ExerciseIcon exercise={b.exercise} size={38} />
              </div>
              <div className="badge">
                {i + 1} of {blocks.length}
              </div>
              <div className="art">
                <ExerciseIcon exercise={b.exercise} size={150} />
              </div>
              <h3>{EXERCISE_INFO[b.exercise].plural}</h3>
              <p>
                {b.sets} × {b.target}
                {EXERCISE_INFO[b.exercise].unit === "sec" ? " sec" : " reps"} · rest {b.restSec}s
              </p>
            </div>
          ))}
        </div>

        <div className="detail glass">
          <div>
            <div className="detail-head">
              <div className="icon">
                <Flame size={42} />
              </div>
              <div>
                <h3>Full body: strength + form</h3>
                <p className="desc">
                  {fromCoach && prof?.focusCue ? `Focus today: ${prof.focusCue}.` : "Three exercises, one session. Your phone tracks every rep and hold; your coach reviews it after."}
                </p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span className="pill ok">
                    <Smartphone size={22} /> On-device pose tracking
                  </span>
                  <span className="pill cloud">
                    <Clock size={22} /> About {estimateMin(blocks)} min
                  </span>
                </div>
              </div>
            </div>
            <div className="plan-list">
              {blocks.map((b, i) => (
                <div key={b.exercise} className="plan-row">
                  <span className="n">{i + 1}</span>
                  <ExerciseIcon exercise={b.exercise} size={30} /> {EXERCISE_INFO[b.exercise].plural}
                  <span className="v">
                    {b.sets} × {b.target}
                    {EXERCISE_INFO[b.exercise].unit === "sec" ? " s" : ""}
                  </span>
                </div>
              ))}
              <div className="plan-row">
                <span className="n">
                  <Timer size={20} />
                </span>
                Rests and phone moves
                <span className="v">built in</span>
              </div>
              <div className="plan-row">
                <span className="n">
                  <Bot size={20} />
                </span>
                AI coach review
                <span className="v">after the workout</span>
              </div>
            </div>
          </div>

          <div className="side">
            <div className="stat-tiles">
              <Tile v={String(recent.length)} l="Sessions" />
              <Tile v={String(thisWeek)} l="This week" />
              <Tile v={recent[0] ? `${recent[0].caloriesEst}` : "–"} l="Last kcal (est.)" />
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
                    {r.blocks.length} exercise{r.blocks.length > 1 ? "s" : ""} · {Math.round(r.durationSec / 60)} min
                  </span>
                  {r.decision && <span className={"chip " + r.decision}>{CHIP[r.decision]}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="start-row">
          <span className="hint">Select to start · Back to exit</span>
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
