// Rest and between-exercise break: animated FireFIT backdrop, big countdown ring, what's next (with its photo),
// and rotating tips for the upcoming exercise.
import { useEffect, useState } from "react";
import { Lightbulb, SkipForward, Smartphone } from "lucide-react";
import { EXERCISE_INFO } from "@firefit/shared/programs";
import type { BlockPlan, Exercise } from "@firefit/shared";
import { Ring } from "../ui";

const TIPS: Record<Exercise, string[]> = {
  squat: [
    "Push your knees out over your toes.",
    "Sit back as if there's a chair behind you.",
    "Chest up, weight in your heels.",
    "Breathe in on the way down, out on the way up.",
  ],
  pushup: [
    "Hands just wider than your shoulders.",
    "One straight line from head to heels.",
    "Lower until your elbows reach about 90°.",
    "Elbows about 45° from your body, not flared out.",
  ],
  plank: [
    "Elbows right under your shoulders.",
    "Squeeze your glutes and brace your core.",
    "Keep your neck long: look at the floor.",
    "Breathe slowly; don't hold your breath.",
  ],
};
const GENERAL = ["Shake out your arms and legs.", "Take a sip of water.", "Slow, deep breaths bring your heart rate down."];

export function BreakScreen(props: { kind: "rest" | "transition"; left: number; total: number; next: BlockPlan; nextSet: number; finishedSet: boolean }) {
  const { next, left, total } = props;
  const info = EXERCISE_INFO[next.exercise];
  const tips = [...TIPS[next.exercise], ...GENERAL];
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTip((n) => (n + 1) % tips.length), 7000);
    return () => clearInterval(id);
  }, [tips.length]);

  return (
    <div className="break-screen">
      <div className="break-bg" />
      <div className="break-sheen" />
      <div className="embers">
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 53) % 100}%`, animationDelay: `${(i * 0.7) % 6}s`, animationDuration: `${6 + (i % 5)}s` }} />
        ))}
      </div>

      <div className="break-content">
        <div className="break-left">
          <p className="break-kicker">{props.finishedSet ? "Set complete!" : props.kind === "rest" ? "Rest" : "Next exercise"}</p>
          <div className="break-ring">
            <Ring id="breakRing" size={420} stroke={26} p={total ? left / total : 0} from="#ff9a3c" to="#ffd29c" />
            <div className="break-num num">{left}</div>
            <div className="break-unit">seconds</div>
          </div>
          <div className="break-skip">
            <SkipForward size={28} /> Select to {props.kind === "rest" ? "skip rest" : "start now"}
          </div>
        </div>

        <div className="break-right">
          <div className="break-next glass">
            <img src={`/img/${next.exercise}.jpg`} alt="" />
            <div className="break-next-cap">
              <span className="muted">Up next</span>
              <b>
                {info.plural}
                {props.kind === "rest" ? ` · set ${props.nextSet} of ${next.sets}` : ""}
              </b>
              <span>
                {next.target}
                {info.unit === "sec" ? " second hold" : " reps"}
              </span>
            </div>
          </div>
          {props.kind === "transition" && (
            <div className="break-move glass">
              <Smartphone size={40} />
              <div>
                <b>Move your phone</b>
                <span>{info.camera}.</span>
              </div>
            </div>
          )}
          <div className="break-tip glass" key={tip}>
            <Lightbulb size={36} />
            <span>{tips[tip]}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
