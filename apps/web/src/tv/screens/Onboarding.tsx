// First-run account creation, remote-only: name (Fire TV on-screen keyboard), level, weight, goal.
// No password: a profile is a name plus the training data the AI coach reasons with.
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Dumbbell, Gauge, Target, User, Weight } from "lucide-react";
import type { NewProfile } from "@firefit/shared";
import { GOALS, LEVELS } from "@firefit/shared/programs";
import { sfx } from "../beep";
import { useRemote } from "../useRemote";

const LB_PER_KG = 2.20462;
type Row = "name" | "level" | "weight" | "goal" | "create";
const ROWS: Row[] = ["name", "level", "weight", "goal", "create"];

export function Onboarding(props: { first: boolean; busy: boolean; error?: string; onCreate: (p: NewProfile) => void; onCancel?: () => void }) {
  const [row, setRow] = useState(0);
  const [name, setName] = useState("");
  const [level, setLevel] = useState(0);
  const [goal, setGoal] = useState(0);
  const [lbs, setLbs] = useState(175);
  const [hint, setHint] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const leftInputAt = useRef(0);
  const blurredAt = useRef(0);
  const r = ROWS[row];

  useRemote((k, fromInput) => {
    if (props.busy) return;
    if (fromInput) {
      // Enter / Next on the on-screen keyboard: go to Level. Swallow the duplicate Enter some keyboards send.
      leftInputAt.current = Date.now();
      if (k === "select" || k === "down") setRow(1);
      return;
    }
    // The Fire TV keyboard's Next button moves focus off the field first, then sends Enter.
    if (k === "select" && r === "name" && Date.now() - blurredAt.current < 800) {
      leftInputAt.current = Date.now();
      setRow(1);
      return;
    }
    if (k === "select" && Date.now() - leftInputAt.current < 600) return;
    if (k === "up" || k === "down") {
      sfx.nav();
      setRow((n) => Math.max(0, Math.min(ROWS.length - 1, n + (k === "down" ? 1 : -1))));
    } else if (k === "left" || k === "right") {
      const d = k === "right" ? 1 : -1;
      if (r === "level") setLevel((n) => (n + d + LEVELS.length) % LEVELS.length);
      if (r === "goal") setGoal((n) => (n + d + GOALS.length) % GOALS.length);
      if (r === "weight") setLbs((n) => Math.max(70, Math.min(550, n + d * 5)));
      if (r !== "name" && r !== "create") sfx.nav();
    } else if (k === "select") {
      if (r === "name") {
        sfx.select();
        input.current?.focus(); // opens the Fire TV keyboard
      } else if (r === "create") {
        if (!name.trim()) {
          sfx.error();
          setHint("Add your name first");
          setRow(0);
          return;
        }
        sfx.select();
        props.onCreate({ name: name.trim(), level: LEVELS[level], goal: GOALS[goal], weightKg: Math.round((lbs / LB_PER_KG) * 10) / 10 });
      } else setRow((n) => n + 1);
    } else if (k === "back" && props.onCancel) {
      sfx.back();
      props.onCancel();
    }
  });

  return (
    <main className="onboard">
      <section className="onboard-card glass">
        <div className="onboard-head">
          <h1>{props.first ? "Welcome to FireFIT" : "Add a profile"}</h1>
          <p className="muted">Tell your AI coach a little about you. It uses this to plan every session.</p>
        </div>

        <Field on={r === "name"} icon={<User size={34} />} label="Name">
          <input
            ref={input}
            className="name-input"
            value={name}
            maxLength={40}
            onBlur={() => (blurredAt.current = Date.now())}
            placeholder="Your name"
            onChange={(e) => {
              setName(e.target.value);
              setHint("");
            }}
          />
        </Field>
        <Field on={r === "level"} icon={<Gauge size={34} />} label="Level">
          <Chips items={LEVELS} value={level} />
        </Field>
        <Field on={r === "weight"} icon={<Weight size={34} />} label="Weight">
          <div className="stepper">
            <ChevronLeft size={34} />
            <span className="num big">{lbs} lb</span>
            <span className="muted num">{Math.round(lbs / LB_PER_KG)} kg</span>
            <ChevronRight size={34} />
          </div>
        </Field>
        <Field on={r === "goal"} icon={<Target size={34} />} label="Goal">
          <Chips items={GOALS} value={goal} />
        </Field>

        <div className={"create-btn" + (r === "create" ? " on" : "")}>
          <Dumbbell size={32} /> {props.busy ? "Creating your profile…" : "Create profile"}
        </div>
        <p className="hint">
          {props.error ?? hint ?? ""}
          {!props.error && !hint && "▲▼ move · ◀ ▶ change · Select to edit" + (props.onCancel ? " · Back to cancel" : "")}
        </p>
      </section>
    </main>
  );
}

function Field({ on, icon, label, children }: { on: boolean; icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className={"field" + (on ? " on" : "")}>
      <div className="field-label">
        {icon}
        {label}
      </div>
      <div className="field-value">{children}</div>
    </div>
  );
}

function Chips({ items, value }: { items: readonly string[]; value: number }) {
  return (
    <div className="chips">
      {items.map((it, i) => (
        <span key={it} className={"opt" + (i === value ? " sel" : "")}>
          {it}
        </span>
      ))}
    </div>
  );
}
