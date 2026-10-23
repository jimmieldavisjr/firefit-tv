// Library (home): profile + streak on the left; the session (one connected workout) with Start, all-time totals,
// and past sessions you can open for their after-action report. Sized to sit fully inside 1920x1080.
// Remote: ▲▼ move, ◀ profile, Select open/start, Back exit.
import { useState } from "react";
import { ChevronRight, Clock, Flame, Gauge, Layers, Play, Target, Timer, Trophy, Users, Weight, Zap } from "lucide-react";
import { EXERCISE_INFO } from "@firefit/shared/programs";
import type { BlockPlan, Decision, LifetimeStats, ProfileView } from "@firefit/shared";
import { sfx } from "../beep";
import { initials } from "../ui";
import { useRemote } from "../useRemote";
import { TRANSITION_SEC } from "../workout";

const CHIP: Record<Decision, string> = { progress: "Progress", hold: "Hold", deload: "Deload", technique: "Technique" };
const KG_TO_LB = 2.20462;

/** Rough session length: ~3 s per rep, the plank's hold time, rests and phone moves between exercises. */
export function estimateMin(blocks: BlockPlan[]) {
  const sec = blocks.reduce((a, b) => a + b.sets * (EXERCISE_INFO[b.exercise].unit === "sec" ? b.target + 8 : b.target * 3 + 8) + (b.sets - 1) * b.restSec, 0);
  return Math.round((sec + (blocks.length - 1) * TRANSITION_SEC) / 60);
}

/** Local YYYY-MM-DD for "today" and "yesterday": a streak is current only if the last workout was one of them. */
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function liveStreak(st: LifetimeStats | undefined) {
  if (!st?.lastDate) return 0;
  const yesterday = localDate(new Date(Date.now() - 86_400_000));
  return st.lastDate === localDate() || st.lastDate === yesterday ? st.currentStreak : 0;
}
const hm = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m` : `${Math.round(sec / 60)} min`);

export function Library(props: {
  blocks: BlockPlan[];
  profile?: ProfileView | null;
  onStart: () => void;
  onOpen: (id: string) => void;
  onProfiles: () => void;
}) {
  const { blocks, profile } = props;
  const prof = profile?.profile;
  const name = prof?.name ?? "Guest";
  const stats = profile?.stats;
  const streak = liveStreak(stats);
  const recent = (profile?.recent ?? []).slice(0, 4);
  const focusables = ["start", ...recent.map((r) => r.id), "profile"];
  const [focus, setFocus] = useState(0);
  const f = focusables[Math.min(focus, focusables.length - 1)];
  const sets = blocks.reduce((a, b) => a + b.sets, 0);

  useRemote((k) => {
    if (k === "up" || k === "down") {
      sfx.nav();
      setFocus((n) => Math.max(0, Math.min(focusables.length - 1, n + (k === "down" ? 1 : -1))));
    } else if (k === "left" && f !== "profile") {
      sfx.nav();
      setFocus(focusables.length - 1);
    } else if (k === "right" && f === "profile") {
      sfx.nav();
      setFocus(0);
    } else if (k === "select") {
      sfx.select();
      if (f === "start") props.onStart();
      else if (f === "profile") props.onProfiles();
      else props.onOpen(f);
    } else if (k === "back") {
      sfx.back();
      window.FireFitHost?.exit();
    }
  });

  return (
    <main className="home">
      <aside className="home-left">
        <section className={"glass home-profile" + (f === "profile" ? " focused-card" : "")}>
          <div className="avatar-row">
            <div className="avatar">{initials(name)}</div>
            <div className="name">{name}</div>
          </div>
          <Row icon={<Target size={28} />} label="Goal" value={prof?.goal ?? "Strength + form"} />
          <Row icon={<Gauge size={28} />} label="Level" value={prof?.level ?? "Beginner"} />
          <Row icon={<Weight size={28} />} label="Weight" value={`${Math.round((prof?.weightKg ?? 80) * KG_TO_LB)} lb`} />
          <div className={"switch-btn" + (f === "profile" ? " on" : "")}>
            <Users size={26} /> Switch or add profile
          </div>
        </section>

        <section className="glass streak-card">
          <div className={"streak-flame" + (streak ? " lit" : "")}>
            <Flame size={64} />
          </div>
          <div>
            <div className="streak-n num">
              {streak} day{streak === 1 ? "" : "s"}
            </div>
            <div className="muted">{streak ? "Current streak" : "Work out today to start a streak"}</div>
            <div className="streak-best">
              <Trophy size={22} /> Best: {stats?.bestStreak ?? 0} day{stats?.bestStreak === 1 ? "" : "s"}
            </div>
          </div>
        </section>
      </aside>

      <section className="home-main">
        <div className={"session glass" + (f === "start" ? " focused-card" : "")}>
          <div className="session-head">
            <div>
              <h3>Full body: strength + form</h3>
              <div className="session-meta">
                <span>
                  <Clock size={24} /> About {estimateMin(blocks)} min
                </span>
                <span>
                  <Layers size={24} /> {blocks.length} exercises · {sets} sets
                </span>
              </div>
              {prof?.focusCue && prof.next && <div className="session-focus">Focus: {prof.focusCue}</div>}
            </div>
            <div className={"start-btn" + (f === "start" ? " on" : "")}>
              <Play size={32} fill="#fff" /> Start workout <ChevronRight size={32} />
            </div>
          </div>
          <div className="steps-strip">
            {blocks.map((b, i) => (
              <div key={b.exercise} className="step-wrap">
                <div className="step-tile">
                  <img src={`/img/${b.exercise}-sm.jpg`} alt="" />
                  <span className="step-n">{i + 1}</span>
                  <div className="step-cap">
                    <b>{EXERCISE_INFO[b.exercise].plural}</b>
                    <span>
                      {b.sets} × {b.target}
                      {EXERCISE_INFO[b.exercise].unit === "sec" ? " sec" : " reps"}
                    </span>
                  </div>
                </div>
                {i < blocks.length - 1 && (
                  <div className="step-link">
                    <ChevronRight size={36} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="home-row">
          <section className="glass totals">
            <h3>All time</h3>
            <div className="totals-grid">
              <Tile icon={<Zap size={30} />} v={String(stats?.workouts ?? 0)} l="Workouts" />
              <Tile icon={<Timer size={30} />} v={hm(stats?.totalSec ?? 0)} l="Total time" />
              <Tile icon={<Flame size={30} className="fire" />} v={String(stats?.totalKcal ?? 0)} l="Calories (est.)" />
              <Tile icon={<Trophy size={30} />} v={`${stats?.bestStreak ?? 0}d`} l="Best streak" />
            </div>
          </section>

          <section className="glass history2">
            <h3>Past sessions</h3>
            {recent.length === 0 && <div className="muted">Your first workout starts your history.</div>}
            {recent.map((r) => (
              <div key={r.id} className={"hist2" + (f === r.id ? " on" : "")}>
                <span className="when">{new Date(r.completedAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                <span className="num muted">
                  {Math.round(r.durationSec / 60)} min · {r.caloriesEst} kcal
                </span>
                {r.decision ? <span className={"chip " + r.decision}>{CHIP[r.decision]}</span> : <span />}
                <ChevronRight size={26} className="go" />
              </div>
            ))}
          </section>
        </div>
      </section>
    </main>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="prow">
      {icon}
      {label}
      <span className="v">{value}</span>
    </div>
  );
}

function Tile({ icon, v, l }: { icon: React.ReactNode; v: string; l: string }) {
  return (
    <div className="tile2">
      <div className="muted">{icon}</div>
      <div className="v num">{v}</div>
      <div className="l">{l}</div>
    </div>
  );
}
