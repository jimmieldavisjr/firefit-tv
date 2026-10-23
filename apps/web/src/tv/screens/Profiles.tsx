// Who's working out? Pick a household profile or add a new one (remote: ◀ ▶ and Select).
import { useState } from "react";
import { Plus } from "lucide-react";
import type { ProfileSummary } from "@firefit/shared";
import { sfx } from "../beep";
import { initials } from "../ui";
import { useRemote } from "../useRemote";

export function Profiles(props: { profiles: ProfileSummary[]; currentId: string | null; onPick: (p: ProfileSummary) => void; onAdd: () => void; onBack?: () => void }) {
  const start = Math.max(0, props.profiles.findIndex((p) => p.id === props.currentId));
  const [focus, setFocus] = useState(start);
  const count = props.profiles.length + 1; // + "Add profile"

  useRemote((k) => {
    if (k === "left" || k === "right") {
      sfx.nav();
      setFocus((n) => Math.max(0, Math.min(count - 1, n + (k === "right" ? 1 : -1))));
    } else if (k === "select") {
      sfx.select();
      if (focus < props.profiles.length) props.onPick(props.profiles[focus]);
      else props.onAdd();
    } else if (k === "back" && props.onBack) {
      sfx.back();
      props.onBack();
    }
  });

  return (
    <main className="profiles">
      <h1>Who's working out?</h1>
      <div className="profile-row">
        {props.profiles.map((p, i) => (
          <div key={p.id} className={"ptile glass" + (i === focus ? " focused" : "")}>
            <div className="avatar xl">{initials(p.name)}</div>
            <div className="pname">{p.name}</div>
            <div className="muted">
              {p.level} · {p.goal}
            </div>
          </div>
        ))}
        <div className={"ptile glass add" + (focus === props.profiles.length ? " focused" : "")}>
          <div className="avatar xl add">
            <Plus size={64} />
          </div>
          <div className="pname">Add profile</div>
          <div className="muted">New person in your household</div>
        </div>
      </div>
      <p className="hint">◀ ▶ choose · Select{props.onBack ? " · Back to return" : ""}</p>
    </main>
  );
}
