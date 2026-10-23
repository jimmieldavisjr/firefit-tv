// Fire TV app root: LIBRARY -> PAIR -> WORKOUT (READY / ACTIVE / REST / PAUSED) -> SUMMARY, remote only.
// The TV drives progress (workout.ts) and tells the phone when to count; the phone stays authoritative for reps.
import { useCallback, useEffect, useRef, useState } from "react";
import type { CoachPlan, PhoneMsg, ProfileView, TvMsg, WorkoutInput } from "@firefit/shared";
import { PROGRAMS } from "@firefit/shared/programs";
import { api, poll, tvConnect } from "../shared/rtc";
import { beep, unlockAudio } from "./beep";
import { Library, type Program } from "./screens/Library";
import { Pair } from "./screens/Pair";
import { Summary, type CoachState } from "./screens/Summary";
import { Workout, type Telemetry, type VideoStats } from "./screens/Workout";
import { useRemote } from "./useRemote";
import { initWorkout, toWorkoutInput, workoutReducer, type Phase, type WorkoutEvent, type WorkoutState } from "./workout";

type Screen = "library" | "pair" | "workout" | "summary";
const EMPTY: Telemetry = { stage: "lost", angle: 0, visible: false, phoneFps: 0, seq: 0, lastAt: Date.now() };
const PHASE_CMD: Record<Phase, TvMsg> = {
  ready: { t: "start" }, // phone tracks (and reports visibility); the TV ignores reps until ACTIVE
  active: { t: "resetSet" },
  rest: { t: "pause" },
  paused: { t: "pause" },
  complete: { t: "end" },
};

function buildPrograms(profile?: ProfileView | null): Program[] {
  const base: Program[] = Object.values(PROGRAMS);
  const next = profile?.profile.nextWorkout;
  if (!next) return base;
  const name = next.exercise === "squat" ? "Squats" : "Push-ups";
  return [{ ...next, title: `${name}: coach's plan`, blurb: "", recommended: true, focusCue: profile?.profile.focusCue }, ...base];
}

export function App() {
  const [screen, setScreen] = useState<Screen>("library");
  const [focus, setFocus] = useState(0);
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [pairing, setPairing] = useState<{ qrUrl?: string; code?: string; status: string }>({ status: "" });
  const [w, setW] = useState<WorkoutState | null>(null);
  const [tel, setTel] = useState<Telemetry>(EMPTY);
  const [vstats, setVstats] = useState<VideoStats>({});
  const [link, setLink] = useState("new");
  const [now, setNow] = useState(Date.now());
  const [showDebug, setShowDebug] = useState(true);
  const [summary, setSummary] = useState<{ input: WorkoutInput; coach: CoachState } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const session = useRef<{ pc?: RTCPeerConnection; send?: (m: TvMsg) => unknown; abort: AbortController } | null>(null);
  const phaseRef = useRef<Phase>("ready");
  const programs = buildPrograms(profile);

  const dispatch = useCallback((e: WorkoutEvent) => setW((s) => (s ? workoutReducer(s, e) : s)), []);
  const send = useCallback((m: TvMsg) => session.current?.send?.(m), []);

  const loadProfile = useCallback(() => {
    api<ProfileView>("/profile")
      .then((p) => setProfile(p))
      .catch((err) => console.warn("profile", err));
  }, []);
  useEffect(loadProfile, [loadProfile]);

  const hangUp = useCallback(() => {
    session.current?.abort.abort();
    session.current?.pc?.close();
    session.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setVstats({});
    setLink("new");
  }, []);

  const toLibrary = useCallback(() => {
    send({ t: "end" });
    hangUp();
    setW(null);
    setTel(EMPTY);
    setScreen("library");
    loadProfile();
  }, [hangUp, loadProfile, send]);

  const onMsg = useCallback(
    (m: PhoneMsg) => {
      const at = Date.now();
      if (m.t === "state") {
        setTel((t) => ({ ...t, seq: m.seq, lastAt: at, stage: m.stage, angle: m.angle, visible: m.visible, phoneFps: m.fps }));
        dispatch({ type: "visible", visible: m.visible, now: at });
      } else if (m.t === "rep") {
        setTel((t) => ({ ...t, seq: m.seq, lastAt: at, lastRep: { depth: m.depth, tempo: m.tempo, cue: m.cue } }));
        if (phaseRef.current === "active") beep(m.cue ? 440 : 880);
        dispatch({ type: "rep", rep: { depth: m.depth, tempo: m.tempo, ...(m.cue ? { cue: m.cue } : {}) }, now: at });
      } else {
        setTel((t) => ({ ...t, lastAt: at, phoneFps: m.fps }));
      }
    },
    [dispatch],
  );

  const startPairing = useCallback(
    async (p: Program) => {
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
            session.current?.send?.({ t: "config", exercise: p.exercise, targetReps: p.targetReps });
            session.current?.send?.(PHASE_CMD[phaseRef.current]);
            setScreen("workout");
          },
        });
        if (abort.signal.aborted) return void s.pc.close();
        session.current = { ...session.current!, pc: s.pc, send: s.send };
        setPairing((st) => ({ ...st, status: "Phone found, connecting…" }));
        s.pc.addEventListener("connectionstatechange", () => setLink(s.pc.connectionState));
      } catch (err) {
        if (!abort.signal.aborted)
          setPairing((st) => ({ ...st, status: `Pairing failed: ${(err as Error).message}. Press Select to retry.` }));
      }
    },
    [hangUp, onMsg],
  );

  // Tell the phone what to do whenever the workout phase changes; save and coach on COMPLETE.
  useEffect(() => {
    if (!w) return;
    const prev = phaseRef.current;
    phaseRef.current = w.phase;
    if (prev === w.phase && w.phase !== "active") return;
    send(PHASE_CMD[w.phase]);
    if (w.phase === "active" && prev !== "active") beep(660, 160);
    if (w.phase === "complete" && prev !== "complete") {
      beep(990, 300);
      const input = toWorkoutInput(w);
      setSummary({ input, coach: { status: "saving" } });
      setScreen("summary");
      setTimeout(hangUp, 500);
      (async () => {
        try {
          const saved = await api<{ id: string }>("/workouts", "POST", input);
          setSummary((s) => s && { ...s, coach: { status: "thinking" } });
          const plan = await poll(() => api<CoachPlan>(`/workouts/${saved!.id}/coach`), 1500, 30_000).catch(() => null);
          setSummary((s) => s && { ...s, coach: plan ? { status: "ready", plan } : { status: "unavailable" } });
        } catch (err) {
          setSummary((s) => s && { ...s, coach: { status: "error", error: (err as Error).message } });
        }
      })();
    }
  }, [w?.phase, w?.set]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clock + rest countdown
  useEffect(() => {
    if (screen !== "workout") return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      dispatch({ type: "tick", now: t });
    }, 250);
    return () => clearInterval(id);
  }, [screen, dispatch]);

  // Inbound video stats once a second: proof that frames decode on the TV.
  useEffect(() => {
    if (screen !== "workout") return;
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

  const disconnected = link === "failed" || link === "disconnected" || link === "closed";

  useRemote((k) => {
    unlockAudio();
    const t = Date.now();
    if (screen === "library") {
      if (k === "left") setFocus((f) => Math.max(0, f - 1));
      if (k === "right") setFocus((f) => Math.min(programs.length - 1, f + 1));
      if (k === "select") {
        const p = programs[focus];
        setProgram(p);
        setW(initWorkout({ exercise: p.exercise, sets: p.sets, targetReps: p.targetReps, restSec: p.restSec }));
        phaseRef.current = "ready";
        setTel(EMPTY);
        startPairing(p);
      }
      if (k === "back") window.FireFitHost?.exit();
    } else if (screen === "pair") {
      if (k === "back") toLibrary();
      if (k === "select" && pairing.status.startsWith("Pairing failed") && program) startPairing(program);
    } else if (screen === "workout") {
      if (k === "up") setShowDebug((d) => !d);
      if (disconnected) {
        if (k === "select" && program) startPairing(program);
        if (k === "back") toLibrary();
        return;
      }
      if (k === "select") dispatch({ type: "select", now: t });
      if (k === "playpause") dispatch({ type: "playpause", now: t });
      if (k === "back") {
        if (w?.phase === "paused") toLibrary();
        else dispatch({ type: "playpause", now: t });
      }
    } else if (screen === "summary") {
      if (k === "select" || k === "back") {
        setSummary(null);
        setFocus(0);
        toLibrary();
      }
    }
  });

  useEffect(() => hangUp, [hangUp]);

  return (
    <>
      <video ref={videoRef} className={"remote-video" + (screen === "workout" ? " on" : "")} muted autoPlay playsInline />
      {screen === "library" && <Library programs={programs} focus={Math.min(focus, programs.length - 1)} profile={profile} />}
      {screen === "pair" && program && <Pair title={program.title} {...pairing} />}
      {screen === "workout" && w && program && (
        <Workout w={w} t={tel} v={vstats} link={link} title={program.title} now={now} showDebug={showDebug} />
      )}
      {screen === "summary" && summary && program && <Summary title={program.title} w={summary.input} coach={summary.coach} />}
    </>
  );
}
