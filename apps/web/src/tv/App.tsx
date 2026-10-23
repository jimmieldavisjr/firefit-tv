// Fire TV app root: LIBRARY -> PAIR -> WORKOUT (squats -> push-ups -> plank) -> SUMMARY, remote only.
// The TV drives progress (workout.ts) and tells the phone which exercise to track and when to count;
// the phone stays authoritative for reps and plank hold time.
import { useCallback, useEffect, useRef, useState } from "react";
import type { BlockPlan, CoachRun, NewProfile, PhoneMsg, ProfileSummary, ProfileView, SessionReport, TvMsg, WorkoutInput } from "@firefit/shared";
import { DEFAULT_SESSION } from "@firefit/shared/programs";
import { api, setProfileId, tvConnect } from "../shared/rtc";
import { sfx, unlockAudio } from "./beep";
import { Library } from "./screens/Library";
import { Onboarding } from "./screens/Onboarding";
import { Profiles } from "./screens/Profiles";
import { Pair } from "./screens/Pair";
import { Summary, type CoachState } from "./screens/Summary";
import { Workout, type Telemetry, type VideoStats } from "./screens/Workout";
import { TopBar } from "./ui";
import { useRemote } from "./useRemote";
import { current, initSession, sessionReducer, toWorkoutInput, type Phase, type SessionEvent, type SessionState } from "./workout";

type Screen = "boot" | "onboard" | "profiles" | "library" | "pair" | "workout" | "summary" | "report";
const STORE_KEY = "firefit.profileId";
const readStored = () => {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
};
const writeStored = (id: string) => {
  try {
    localStorage.setItem(STORE_KEY, id);
  } catch {
    /* private mode: the profile picker shows next launch */
  }
};
const EMPTY: Telemetry = { stage: "lost", angle: 0, visible: false, phoneFps: 0, seq: 0, lastAt: Date.now() };
const PHASE_CMD: Record<Phase, TvMsg> = {
  ready: { t: "start" }, // phone tracks (and reports visibility); the TV ignores reps until ACTIVE
  active: { t: "resetSet" },
  rest: { t: "pause" },
  transition: { t: "pause" },
  paused: { t: "pause" },
  complete: { t: "end" },
};

export function App() {
  const [screen, setScreen] = useState<Screen>("boot");
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [report, setReport] = useState<{ when: string; data?: SessionReport; error?: string } | null>(null);
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [pairing, setPairing] = useState<{ qrUrl?: string; code?: string; status: string }>({ status: "" });
  const [w, setW] = useState<SessionState | null>(null);
  const [tel, setTel] = useState<Telemetry>(EMPTY);
  const [vstats, setVstats] = useState<VideoStats>({});
  const [link, setLink] = useState("new");
  const [now, setNow] = useState(Date.now());
  const [showDebug, setShowDebug] = useState(false); // Up on the remote shows link/decoder stats
  const [summary, setSummary] = useState<{ input: WorkoutInput; coach: CoachState } | null>(null);
  const [chatScroll, setChatScroll] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const session = useRef<{ pc?: RTCPeerConnection; send?: (m: TvMsg) => unknown; abort: AbortController } | null>(null);
  const sent = useRef<string>("");
  const wRef = useRef<SessionState | null>(null);
  wRef.current = w;
  const profileRef = useRef<ProfileView | null>(null);
  profileRef.current = profile;
  const lastTick = useRef(-1);

  const blocks: BlockPlan[] = profile?.profile.next?.blocks ?? DEFAULT_SESSION.blocks;
  const who = profile?.profile.name ?? "Guest";
  const weightKg = profile?.profile.weightKg ?? 80;

  const dispatch = useCallback((e: SessionEvent) => setW((s) => (s ? sessionReducer(s, e) : s)), []);
  const send = useCallback((m: TvMsg) => session.current?.send?.(m), []);

  const loadProfile = useCallback(() => {
    api<ProfileView>("/profile")
      .then((p) => setProfile(p))
      .catch((err) => console.warn("profile", err));
  }, []);

  const selectProfile = useCallback(
    (p: ProfileSummary) => {
      setProfileId(p.id);
      setCurrentId(p.id);
      writeStored(p.id);
      setProfile(null);
      loadProfile();
      setScreen("library");
    },
    [loadProfile],
  );

  // Boot: the saved profile goes straight to the library; otherwise pick one, or create the first.
  useEffect(() => {
    api<{ profiles: ProfileSummary[] }>("/profiles")
      .then((r) => {
        const list = r?.profiles ?? [];
        setProfiles(list);
        const saved = list.find((p) => p.id === readStored());
        if (saved) selectProfile(saved);
        else setScreen(list.length ? "profiles" : "onboard");
      })
      .catch(() => setScreen("onboard"));
  }, [selectProfile]);

  const createProfile = useCallback(
    async (input: NewProfile) => {
      setCreating({ busy: true });
      try {
        const p = (await api<ProfileSummary>("/profiles", "POST", input))!;
        setProfiles((list) => [...list, p]);
        setCreating({ busy: false });
        selectProfile(p);
      } catch (err) {
        sfx.error();
        setCreating({ busy: false, error: `Could not create the profile: ${(err as Error).message}` });
      }
    },
    [selectProfile],
  );

  const openReport = useCallback((id: string) => {
    const row = profileRef.current?.recent.find((r) => r.id === id);
    const when = row ? new Date(row.completedAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
    setReport({ when });
    setChatScroll(0);
    setScreen("report");
    api<SessionReport>(`/workouts/${id}`)
      .then((data) => setReport((r) => r && { ...r, data: data ?? undefined }))
      .catch((err) => setReport((r) => r && { ...r, error: (err as Error).message }));
  }, []);

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
    setSummary(null);
    setScreen("library");
    loadProfile();
  }, [hangUp, loadProfile, send]);

  /** Tell the phone the current exercise and what to do, once per (block, set, phase) change. */
  const syncPhone = useCallback((s: SessionState, force = false) => {
    const b = current(s);
    const key = `${s.block}:${s.set}:${s.phase}`;
    if (!force && sent.current === key) return;
    const prevBlock = sent.current.split(":")[0];
    sent.current = key;
    if (force || prevBlock !== String(s.block)) session.current?.send?.({ t: "config", exercise: b.exercise, target: b.target });
    session.current?.send?.(PHASE_CMD[s.phase]);
  }, []);

  const onMsg = useCallback(
    (m: PhoneMsg) => {
      const at = Date.now();
      if (m.t === "state") {
        setTel((t) => ({ ...t, seq: m.seq, lastAt: at, stage: m.stage, angle: m.angle, visible: m.visible, phoneFps: m.fps, good: m.good, cue: m.cue }));
        dispatch({ type: "visible", visible: m.visible, now: at });
        if (m.holdMs !== undefined) dispatch({ type: "hold", holdMs: m.holdMs, good: !!m.good, now: at });
      } else if (m.t === "rep") {
        setTel((t) => ({ ...t, seq: m.seq, lastAt: at, lastRep: { depth: m.depth, tempo: m.tempo, cue: m.cue } }));
        if (wRef.current?.phase === "active") (m.cue ? sfx.repCue : sfx.rep)();
        dispatch({ type: "rep", rep: { depth: m.depth, tempo: m.tempo, ...(m.at !== undefined ? { at: m.at } : {}), ...(m.cue ? { cue: m.cue } : {}) }, now: at });
      } else {
        setTel((t) => ({ ...t, lastAt: at, phoneFps: m.fps }));
      }
    },
    [dispatch],
  );

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
          if (wRef.current) syncPhone(wRef.current, true);
          setScreen("workout");
        },
      });
      if (abort.signal.aborted) return void s.pc.close();
      session.current = { ...session.current!, pc: s.pc, send: s.send };
      setPairing((st) => ({ ...st, status: "Phone found, connecting…" }));
      s.pc.addEventListener("connectionstatechange", () => setLink(s.pc.connectionState));
    } catch (err) {
      if (!abort.signal.aborted) setPairing((st) => ({ ...st, status: `Pairing failed: ${(err as Error).message}. Press Select to retry.` }));
    }
  }, [hangUp, onMsg, syncPhone]);

  // Phase changes: drive the phone, play cues, and save + coach on COMPLETE.
  useEffect(() => {
    if (!w) return;
    const prevPhase = sent.current.split(":")[2];
    syncPhone(w);
    if (w.phase === "active" && prevPhase !== "active") sfx.start();
    if ((w.phase === "rest" || w.phase === "transition") && prevPhase === "active") sfx.setDone();
    if (w.phase === "complete" && prevPhase !== "complete") {
      sfx.complete();
      const input = toWorkoutInput(w, weightKg);
      setSummary({ input, coach: { status: "saving" } });
      setChatScroll(0);
      setScreen("summary");
      setTimeout(hangUp, 500);
      (async () => {
        try {
          const saved = await api<{ id: string }>("/workouts", "POST", input);
          setSummary((s) => s && { ...s, coach: { status: "waiting" } });
          // Poll the coach: the transcript grows while the agent works, then the plan arrives.
          for (const end = Date.now() + 90_000; Date.now() < end; await new Promise((r) => setTimeout(r, 1000))) {
            const run = await api<CoachRun>(`/workouts/${saved!.id}/coach`).catch(() => null);
            if (!run) continue;
            setSummary((s) => s && { ...s, coach: { status: run.status, run } });
            if (run.status === "done") return;
          }
          setSummary((s) => s && { ...s, coach: { ...s.coach, status: "unavailable" } });
        } catch (err) {
          setSummary((s) => s && { ...s, coach: { status: "error", error: (err as Error).message } });
        }
      })();
    }
  }, [w?.phase, w?.block, w?.set]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clock + rest/transition countdowns
  useEffect(() => {
    if (screen !== "workout") return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      dispatch({ type: "tick", now: t });
      // countdown ticks for the last 3 seconds of a rest or phone-move break
      const s = wRef.current;
      if (s && (s.phase === "rest" || s.phase === "transition") && s.restEndsAt) {
        const left = Math.ceil((s.restEndsAt - t) / 1000);
        if (left <= 3 && left >= 1 && left !== lastTick.current) sfx.tick();
        lastTick.current = left;
      }
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
    if (screen === "boot" || screen === "library" || screen === "onboard" || screen === "profiles") return; // screens with their own focus
    if (k === "select") sfx.select();
    else if (k === "back") sfx.back();
    else if (k !== "playpause") sfx.nav();
    if (screen === "pair") {
      if (k === "back") toLibrary();
      if (k === "select" && pairing.status.startsWith("Pairing failed")) startPairing();
    } else if (screen === "workout") {
      if (k === "up") setShowDebug((d) => !d);
      if (disconnected) {
        if (k === "select") startPairing();
        if (k === "back") toLibrary();
        return;
      }
      if (k === "select") dispatch({ type: "select", now: t });
      if (k === "playpause") dispatch({ type: "playpause", now: t });
      if (k === "back") {
        if (w?.phase === "paused") toLibrary();
        else dispatch({ type: "playpause", now: t });
      }
    } else if (screen === "summary" || screen === "report") {
      if (k === "up") setChatScroll((n) => n - 1);
      if (k === "down") setChatScroll((n) => n + 1);
      if (k === "select" || k === "back") {
        setReport(null);
        toLibrary();
      }
    }
  });

  const startSession = useCallback(() => {
    unlockAudio();
    sent.current = "";
    setW(initSession(blocks));
    setTel(EMPTY);
    startPairing();
  }, [blocks, startPairing]);

  useEffect(() => hangUp, [hangUp]);

  const coverBg = screen === "boot" || screen === "onboard" || screen === "profiles";
  return (
    <>
      <video ref={videoRef} className={"remote-video" + (screen === "workout" ? " on" : "")} muted autoPlay playsInline />
      {screen !== "workout" && <div className={coverBg ? "cover-bg" : "ambient"} />}
      {screen === "boot" && (
        <div className="boot">
          <span className="spinner" /> Loading FireFIT…
        </div>
      )}
      {screen === "onboard" && (
        <Onboarding
          first={profiles.length === 0}
          busy={creating.busy}
          error={creating.error}
          onCreate={createProfile}
          onCancel={profiles.length ? () => setScreen(currentId ? "library" : "profiles") : undefined}
        />
      )}
      {screen === "profiles" && (
        <Profiles profiles={profiles} currentId={currentId} onPick={selectProfile} onAdd={() => setScreen("onboard")} onBack={currentId ? () => setScreen("library") : undefined} />
      )}
      {screen === "library" && <TopBar step="Library" who={who} />}
      {screen === "pair" && <TopBar step="Pair" who={who} />}
      {(screen === "summary" || screen === "report") && <TopBar step="Summary" who={who} />}
      {screen === "library" && (
        <Library
          blocks={blocks}
          profile={profile}
          onStart={startSession}
          onOpen={openReport}
          onProfiles={() => {
            api<{ profiles: ProfileSummary[] }>("/profiles").then((r) => r && setProfiles(r.profiles));
            setScreen("profiles");
          }}
        />
      )}
      {screen === "pair" && <Pair title="Full body: squats · push-ups · plank" {...pairing} />}
      {screen === "workout" && w && <Workout w={w} t={tel} v={vstats} link={link} now={now} who={who} weightKg={weightKg} showDebug={showDebug} />}
      {screen === "summary" && summary && <Summary w={summary.input} coach={summary.coach} scroll={chatScroll} />}
      {screen === "report" && report && !report.data && (
        <div className="boot">
          {report.error ? (
            `Could not load this session: ${report.error}`
          ) : (
            <>
              <span className="spinner" /> Loading your report…
            </>
          )}
        </div>
      )}
      {screen === "report" && report?.data && (
        <Summary
          w={report.data.session}
          coach={report.data.coach ? { status: "done", run: report.data.coach } : { status: "unavailable" }}
          scroll={chatScroll}
          heading={`After-action report · ${report.when}`}
          hint="Select or Back: return to the library · Up/Down scrolls the coach"
        />
      )}
    </>
  );
}
