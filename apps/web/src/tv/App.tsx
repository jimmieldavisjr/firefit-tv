// Fire TV app root. Block 2: LIBRARY -> PAIR -> LIVE (phone video + live rep counter over the DataChannel).
// Block 3 extends LIVE into the workout state machine (READY -> ACTIVE -> REST -> COMPLETE).
import { useCallback, useEffect, useRef, useState } from "react";
import type { PhoneMsg, TvMsg } from "@firefit/shared";
import { PROGRAMS } from "@firefit/shared/programs";
import { tvConnect } from "../shared/rtc";
import { Library, type Program } from "./screens/Library";
import { Pair } from "./screens/Pair";
import { Live, type Telemetry, type VideoStats } from "./screens/Live";
import { useRemote } from "./useRemote";

const programs: Program[] = Object.values(PROGRAMS);
type Screen = "library" | "pair" | "live";

const EMPTY: Telemetry = { reps: 0, stage: "lost", angle: 0, visible: false, phoneFps: 0, seq: 0, lastType: "–", lastAt: Date.now() };

export function App() {
  const [screen, setScreen] = useState<Screen>("library");
  const [focus, setFocus] = useState(0);
  const [pairing, setPairing] = useState<{ qrUrl?: string; code?: string; status: string }>({ status: "" });
  const [tel, setTel] = useState<Telemetry>(EMPTY);
  const [vstats, setVstats] = useState<VideoStats>({});
  const [link, setLink] = useState("new");
  const videoRef = useRef<HTMLVideoElement>(null);
  const session = useRef<{ pc?: RTCPeerConnection; send?: (m: TvMsg) => unknown; abort: AbortController } | null>(null);
  const program = programs[focus];

  const hangUp = useCallback(() => {
    session.current?.abort.abort();
    session.current?.send?.({ t: "end" });
    session.current?.pc?.close();
    session.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setTel(EMPTY);
    setVstats({});
    setLink("new");
  }, []);

  const onMsg = useCallback((m: PhoneMsg) => {
    setTel((t) => {
      const base = { ...t, seq: "seq" in m ? m.seq : t.seq, lastType: m.t, lastAt: Date.now() };
      if (m.t === "state") return { ...base, reps: m.reps, stage: m.stage, angle: m.angle, visible: m.visible, phoneFps: m.fps };
      if (m.t === "rep") return { ...base, reps: m.reps, lastRep: { depth: m.depth, tempo: m.tempo, cue: m.cue } };
      return { ...base, phoneFps: m.fps };
    });
  }, []);

  const startPairing = useCallback(async () => {
    hangUp();
    const abort = new AbortController();
    session.current = { abort };
    setScreen("pair");
    setPairing({ status: "Creating a pairing room…" });
    try {
      const s = await tvConnect({
        video: videoRef.current!,
        signal: abort.signal,
        onRoom: (qrUrl, code) => setPairing({ qrUrl, code, status: "Waiting for your phone…" }),
        onMsg,
        onOpen: () => {
          session.current?.send?.({ t: "config", exercise: program.exercise, targetReps: program.targetReps });
          session.current?.send?.({ t: "start" });
          setScreen("live");
        },
      });
      if (abort.signal.aborted) return s.pc.close();
      session.current = { ...session.current!, pc: s.pc, send: s.send };
      setPairing((p) => ({ ...p, status: "Phone found, connecting…" }));
      s.pc.addEventListener("connectionstatechange", () => setLink(s.pc.connectionState));
    } catch (err) {
      if (!abort.signal.aborted) setPairing((p) => ({ ...p, status: `Pairing failed: ${(err as Error).message}. Press Select to retry.` }));
    }
  }, [hangUp, onMsg, program]);

  // Sample inbound video stats once a second: proof that frames are actually decoding on the TV.
  useEffect(() => {
    if (screen !== "live") return;
    const id = setInterval(async () => {
      const pc = session.current?.pc;
      if (!pc) return;
      const stats = await pc.getStats();
      stats.forEach((r) => {
        if (r.type === "inbound-rtp" && r.kind === "video")
          setVstats({
            fps: r.framesPerSecond,
            decoded: r.framesDecoded,
            lost: r.packetsLost,
            size: r.frameWidth ? `${r.frameWidth}×${r.frameHeight}` : undefined,
            codec: stats.get(r.codecId)?.mimeType?.replace("video/", ""),
          });
      });
    }, 1000);
    return () => clearInterval(id);
  }, [screen]);

  useRemote((k) => {
    if (screen === "library") {
      if (k === "left") setFocus((f) => Math.max(0, f - 1));
      if (k === "right") setFocus((f) => Math.min(programs.length - 1, f + 1));
      if (k === "select") startPairing();
      if (k === "back") window.FireFitHost?.exit();
    } else if (screen === "pair") {
      if (k === "back") {
        hangUp();
        setScreen("library");
      }
      if (k === "select" && pairing.status.startsWith("Pairing failed")) startPairing();
    } else if (screen === "live") {
      if (k === "back") {
        hangUp();
        setScreen("library");
      }
      if (k === "select") session.current?.send?.({ t: "resetSet" });
    }
  });

  useEffect(() => hangUp, [hangUp]);

  return (
    <>
      <video ref={videoRef} className={"remote-video" + (screen === "live" ? " on" : "")} muted autoPlay playsInline />
      {screen === "library" && <Library programs={programs} focus={focus} />}
      {screen === "pair" && <Pair title={program.title} {...pairing} />}
      {screen === "live" && <Live t={tel} v={vstats} target={program.sets * program.targetReps} link={link} />}
    </>
  );
}
