// Shared 10-foot UI pieces: top bar, exercise icon, gradient rings.
import { useEffect, useState } from "react";
import { BicepsFlexed, Flame, Hourglass, PersonStanding } from "lucide-react";
import type { Exercise } from "@firefit/shared";

export function ExerciseIcon({ exercise, size = 40 }: { exercise: Exercise; size?: number }) {
  if (exercise === "squat") return <PersonStanding size={size} strokeWidth={2.2} />;
  if (exercise === "pushup") return <BicepsFlexed size={size} strokeWidth={2.2} />;
  return <Hourglass size={size} strokeWidth={2.2} />;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "G";

const STEPS = ["Library", "Pair", "Workout", "Summary"] as const;
export type Step = (typeof STEPS)[number];

export function TopBar({ step, who = "Guest" }: { step: Step; who?: string }) {
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return (
    <header className="topbar">
      <div className="logo">
        <Flame size={46} strokeWidth={2.4} />
        fire<span>fit</span>
      </div>
      <nav className="flow glass">
        {STEPS.map((s) => (
          <div key={s} className={"step" + (s === step ? " on" : "")}>
            {s}
          </div>
        ))}
      </nav>
      <div className="right">
        <span className="who">
          <span className="mini-avatar">{initials(who)}</span> {who}
        </span>
        <span className="num">{clock.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
      </div>
    </header>
  );
}

/** Arc ring in SVG. `p` (0..1) fills a gradient arc; optional tick marks and a thinner live inner arc. */
export function Ring(props: {
  size: number;
  stroke: number;
  p: number;
  ticks?: number;
  filledTicks?: number;
  live?: number;
  from?: string;
  to?: string;
  id: string;
}) {
  const { size, stroke, p, ticks = 0, filledTicks = 0, live, from = "#3b9cff", to = "#ff9a3c", id } = props;
  const r = (size - stroke) / 2 - 10;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const ri = r - stroke - 6;
  const ci = 2 * Math.PI * ri;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <g transform={`rotate(-90 ${cx} ${cx})`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <circle
          className="ring-arc"
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, p)))}
        />
        {live !== undefined && (
          <circle
            className="live-arc"
            cx={cx}
            cy={cx}
            r={ri}
            fill="none"
            stroke="rgba(52,211,153,0.85)"
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={ci}
            strokeDashoffset={ci * (1 - Math.min(1, Math.max(0, live)))}
          />
        )}
      </g>
      {Array.from({ length: ticks }, (_, i) => {
        const a = (i / ticks) * 2 * Math.PI - Math.PI / 2;
        const ro = r + stroke / 2 + 6;
        return (
          <circle
            key={i}
            cx={cx + ro * Math.cos(a)}
            cy={cx + ro * Math.sin(a)}
            r={4}
            fill={i < filledTicks ? "#ffb15c" : "rgba(255,255,255,0.25)"}
          />
        );
      })}
    </svg>
  );
}
