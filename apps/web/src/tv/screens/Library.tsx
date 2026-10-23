// Library: today's workout as ONE connected session (squats -> push-ups -> plank), past sessions you can open
// for their after-action report, and the profile switcher. Remote: ▲▼ move, Select open/start, Back exit.
import { useState } from "react";
import { ChevronRight, Circle, Clock, Flame, Gauge, Layers, Play, ScanEye, Sun, Target, Users, Weight, Wifi } from "lucide-react";
import { EXERCISE_INFO } from "@firefit/shared/programs";
import type { BlockPlan, Decision, ProfileView } from "@firefit/shared";
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
      setFocus(focusables.length - 1); // jump to the profile card on the left
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
    <main className="library">
      <aside className={"profile glass" + (f === "profile" ? " focused-card" : "")}>
        <h3>Your profile</h3>
        <div className="avatar-row">
          <div className="avatar">{initials(name)}</div>
          <div className="name">{name}</div>
        </div>
        <Row icon={<Target size={30} />} label="Goal" value={prof?.goal ?? "Strength + form"} />
        <Row icon={<Gauge size={30} />} label="Level" value={prof?.level ?? "Beginner"} />
        <Row icon={<Weight size={30} />} label="Weight" value={`${Math.round((prof?.weightKg ?? 80) * KG_TO_LB)} lb`} />
        <div className="ready-title">Readiness check</div>
        <Check icon={<ScanEye size={30} />} label="Full body visible" />
        <Check icon={<Sun size={30} />} label="Light in front of you" />
        <Check icon={<Wifi size={30} />} label="Same Wi-Fi as the TV" />
        <div className={"switch-btn" + (f === "profile" ? " on" : "")}>
          <Users size={28} /> Switch or add profile
        </div>
      </aside>

      <section className="lib-main">
        <h2>Today's workout</h2>

        {/* One session, not a menu: the three exercises are steps of the same workout */}
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
                <span>
                  <Flame size={24} /> One continuous session
                </span>
              </div>
              {prof?.focusCue && prof.next && <div className="session-focus">Focus today: {prof.focusCue}</div>}
            </div>
            <div className={"start-btn" + (f === "start" ? " on" : "")}>
              <Play size={34} fill="#fff" /> Start workout <ChevronRight size={34} />
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
                      {EXERCISE_INFO[b.exercise].unit === "sec" ? " sec" : " reps"} · rest {b.restSec}s
                    </span>
                  </div>
                </div>
                {i < blocks.length - 1 && (
                  <div className="step-link">
                    <ChevronRight size={40} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="history glass">
          <div className="history-head">
            <h3>Past sessions</h3>
            <span className="muted small">Select a session for its after-action report</span>
          </div>
          {recent.length === 0 && <div className="muted">No sessions yet. Your first workout starts your history.</div>}
          {recent.map((r) => (
            <div key={r.id} className={"hist-row" + (f === r.id ? " on" : "")}>
              <span className="when">{new Date(r.completedAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              <span className="what">
                {r.blocks.map((b) => EXERCISE_INFO[b.exercise].plural).join(" · ")}
              </span>
              <span className="num">{Math.round(r.durationSec / 60)} min</span>
              <span className="num">{r.caloriesEst} kcal</span>
              {r.decision ? <span className={"chip " + r.decision}>{CHIP[r.decision]}</span> : <span />}
              <ChevronRight size={28} className="go" />
            </div>
          ))}
        </div>
        <p className="hint">▲▼ move · ◀ profile · Select · Back to exit</p>
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

function Check({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="check">
      <Circle className="no" size={26} />
      {icon}
      {label}
    </div>
  );
}
