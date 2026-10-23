// Pairing + WebRTC over API Gateway with non-trickle ICE: each side waits for candidate gathering
// to finish, then posts one SDP blob; the other side polls once a second. Same Wi-Fi only, no TURN.
import type { PhoneMsg, RoomCreated, TvMsg } from "@firefit/shared";

const API = import.meta.env.VITE_API_URL ?? "";
const ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
/** ~2.5 Mbps sender cap (Ship Plan Block 2). */
const MAX_BITRATE = 2_500_000;

export async function api<T = unknown>(path: string, method = "GET", body?: unknown, token?: string): Promise<T | null> {
  const r = await fetch(API + path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", ...(token ? { "x-room-token": token } : {}) },
  });
  if (r.status >= 400) throw new Error(`${method} ${path} -> ${r.status}`);
  return r.status === 204 || r.status === 202 ? null : ((await r.json()) as T);
}

export async function poll<T>(fn: () => Promise<T | null>, ms = 1000, maxMs = 120_000, signal?: AbortSignal): Promise<T> {
  for (const end = Date.now() + maxMs; Date.now() < end; await new Promise((r) => setTimeout(r, ms))) {
    if (signal?.aborted) throw new Error("aborted");
    const v = await fn();
    if (v) return v;
  }
  throw new Error("timed out");
}

const iceDone = (pc: RTCPeerConnection, ms = 2500) =>
  new Promise<void>((res) => {
    if (pc.iceGatheringState === "complete") return res();
    const t = setTimeout(res, ms);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(t);
        res();
      }
    });
  });

/** H.264 first: the most likely hardware decoder on Fire TV sticks (Gate 0 listed it). VP8 stays as fallback. */
function preferH264(pc: RTCPeerConnection) {
  const codecs = RTCRtpSender.getCapabilities?.("video")?.codecs;
  if (!codecs) return;
  const rank = (c: RTCRtpCodec) => (c.mimeType === "video/H264" ? 0 : c.mimeType === "video/VP8" ? 1 : 2);
  const sorted = [...codecs].sort((a, b) => rank(a) - rank(b));
  for (const t of pc.getTransceivers()) if (t.sender.track?.kind === "video") t.setCodecPreferences?.(sorted);
}

/** PHONE: the offerer (it owns the track and the DataChannel). room + token come from the QR. */
export async function phoneConnect(room: string, token: string, stream: MediaStream, onMsg: (m: TvMsg) => void) {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  for (const track of stream.getVideoTracks()) {
    const sender = pc.addTrack(track, stream);
    const p = sender.getParameters();
    p.encodings = [{ ...(p.encodings?.[0] ?? {}), maxBitrate: MAX_BITRATE }];
    sender.setParameters(p).catch(() => {}); // applied again after negotiation below
  }
  preferH264(pc);
  const dc = pc.createDataChannel("telemetry"); // ordered + reliable by default
  dc.onmessage = (m) => onMsg(JSON.parse(m.data) as TvMsg);
  await pc.setLocalDescription(await pc.createOffer());
  await iceDone(pc);
  await api(`/rooms/${room}/offer`, "PUT", { sdp: pc.localDescription!.sdp }, token);
  const { sdp } = await poll(() => api<{ sdp: string }>(`/rooms/${room}/answer`, "GET", undefined, token));
  await pc.setRemoteDescription({ type: "answer", sdp });
  for (const sender of pc.getSenders()) {
    const p = sender.getParameters();
    if (p.encodings?.length) {
      p.encodings[0].maxBitrate = MAX_BITRATE;
      await sender.setParameters(p).catch(() => {});
    }
  }
  const send = (m: PhoneMsg) => dc.readyState === "open" && dc.send(JSON.stringify(m));
  return { pc, dc, send };
}

/** TV: creates the room (so the QR can carry code + token), then answers the phone's offer. */
export async function tvConnect(opts: {
  onRoom: (qrUrl: string, code: string) => void;
  video: HTMLVideoElement;
  onMsg: (m: PhoneMsg) => void;
  onOpen?: () => void;
  signal?: AbortSignal;
}) {
  const room = (await api<RoomCreated>("/rooms", "POST"))!;
  const origin = import.meta.env.VITE_PHONE_ORIGIN || location.origin;
  opts.onRoom(`${origin}/phone.html?room=${room.code}&t=${room.token}`, room.code);
  const { sdp } = await poll(
    () => api<{ sdp: string }>(`/rooms/${room.code}/offer`, "GET", undefined, room.token),
    1000,
    14 * 60_000,
    opts.signal,
  );
  const pc = new RTCPeerConnection({ iceServers: ICE });
  let dc: RTCDataChannel | undefined;
  pc.ontrack = (e) => {
    opts.video.srcObject = e.streams[0];
    opts.video.play().catch(() => {});
  };
  pc.ondatachannel = (e) => {
    dc = e.channel;
    dc.onmessage = (m) => opts.onMsg(JSON.parse(m.data) as PhoneMsg);
    if (dc.readyState === "open") opts.onOpen?.();
    else dc.onopen = () => opts.onOpen?.();
  };
  await pc.setRemoteDescription({ type: "offer", sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await iceDone(pc);
  await api(`/rooms/${room.code}/answer`, "PUT", { sdp: pc.localDescription!.sdp }, room.token);
  const send = (m: TvMsg) => dc?.readyState === "open" && dc.send(JSON.stringify(m));
  return { pc, send, code: room.code };
}

/** TV, after COMPLETE: save the workout, then wait for the coach agent's plan (usually a few seconds). */
export async function finishWorkout<P>(w: unknown) {
  const { id } = (await api<{ id: string }>("/workouts", "POST", w))!;
  const plan = await poll(() => api<P>(`/workouts/${id}/coach`), 1500, 30_000).catch(() => null);
  return { id, plan };
}
