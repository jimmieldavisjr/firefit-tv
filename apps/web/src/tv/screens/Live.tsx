// Live view over the phone's video (the skeleton is already baked into the frames).
// Block 2 scope: rep counter + stage + a debug strip proving the link; Block 3 grows this into the full HUD.
import type { Stage } from "@firefit/shared";

export type Telemetry = {
  reps: number;
  stage: Stage;
  angle: number;
  visible: boolean;
  phoneFps: number;
  seq: number;
  lastType: string;
  lastAt: number;
  lastRep?: { depth: number; tempo: number; cue?: string };
};
export type VideoStats = { fps?: number; decoded?: number; codec?: string; size?: string; lost?: number };

export function Live({ t, v, target, link }: { t: Telemetry; v: VideoStats; target: number; link: string }) {
  const pct = Math.min(1, t.reps / Math.max(1, target));
  return (
    <div className="live">
      <div className="hud-tl">
        <div className="ring" style={{ ["--p" as string]: pct }}>
          <span className="ring-n">{t.reps}</span>
          <span className="ring-d">/ {target}</span>
        </div>
        <div className={"stage " + t.stage}>{t.stage === "lost" ? "Step into frame" : t.stage === "down" ? "Down" : "Up"}</div>
        {t.lastRep && (
          <div className="last-rep">
            Last rep · depth {t.lastRep.depth}° · tempo {t.lastRep.tempo}s
          </div>
        )}
        {t.lastRep?.cue && <div className="cue">{t.lastRep.cue}</div>}
      </div>
      <div className="debug-strip">
        link {link} · msg #{t.seq} {t.lastType} {Math.max(0, Date.now() - t.lastAt)}ms ago · angle {t.angle}° · phone {t.phoneFps} fps ·
        TV video {v.fps ?? "–"} fps {v.size ?? ""} {v.codec ?? ""} · decoded {v.decoded ?? 0} · lost {v.lost ?? 0}
      </div>
    </div>
  );
}
