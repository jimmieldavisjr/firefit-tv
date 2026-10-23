// Gate 0 capability probe. Load it on the TV through the shell:
//   adb shell am start -n app.firefit.tv/.MainActivity --es url "http://<laptop-ip>:5173/probe.html"
// Runs encode -> decode -> DataChannel entirely on the TV. A feature check alone is not enough:
// the verdict requires framesDecoded to keep rising on the receiving side.
const out = document.getElementById("o") as HTMLPreElement;
const video = document.getElementById("v") as HTMLVideoElement;
const log = (s: string, cls?: "pass" | "fail") => {
  const line = document.createElement("span");
  line.textContent = s + "\n";
  if (cls) line.className = cls;
  out.appendChild(line);
  console.log("[probe]", s);
};

const result: Record<string, unknown> = { ua: navigator.userAgent };

async function main() {
  log("UA: " + navigator.userAgent);
  const hasPc = typeof RTCPeerConnection === "function";
  result.rtcPeerConnection = hasPc;
  log("RTCPeerConnection: " + typeof RTCPeerConnection, hasPc ? "pass" : "fail");
  if (!hasPc) return verdict(false, "No WebRTC in this WebView: use fallback L3 (HTTP polling).");

  const caps = RTCRtpReceiver.getCapabilities?.("video");
  const decoders = [...new Set(caps?.codecs.map((c) => c.mimeType) ?? [])];
  result.decoders = decoders;
  log("decoders: " + decoders.join(" "));

  // loopback: canvas -> PC a -> PC b -> <video>, all on this device
  const c = Object.assign(document.createElement("canvas"), { width: 1280, height: 720 });
  const g = c.getContext("2d")!;
  let f = 0;
  setInterval(() => {
    g.fillStyle = `hsl(${f++ % 360} 80% 45%)`;
    g.fillRect(0, 0, 1280, 720);
    g.fillStyle = "#fff";
    g.font = "160px sans-serif";
    g.fillText(String(f), 80, 420);
  }, 33);

  const a = new RTCPeerConnection();
  const b = new RTCPeerConnection();
  a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate);
  b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate);
  b.ontrack = (e) => {
    video.srcObject = e.streams[0];
    video.play().catch((err) => log("video.play failed: " + err, "fail"));
  };
  let dcOk = false;
  b.ondatachannel = (e) => {
    e.channel.onmessage = (m) => {
      dcOk = m.data === "ok";
      log("datachannel: " + m.data, dcOk ? "pass" : "fail");
    };
  };
  const s = c.captureStream(30);
  s.getTracks().forEach((t) => a.addTrack(t, s));
  const dc = a.createDataChannel("t");
  dc.onopen = () => dc.send("ok");
  await a.setLocalDescription();
  await b.setRemoteDescription(a.localDescription!);
  await b.setLocalDescription();
  await a.setRemoteDescription(b.localDescription!);

  const sample = async () => {
    let r: { framesDecoded: number; fps?: number; decoder?: string; codec?: string } = { framesDecoded: 0 };
    const stats = await b.getStats();
    stats.forEach((x) => {
      if (x.type === "inbound-rtp" && x.kind === "video")
        r = { framesDecoded: x.framesDecoded ?? 0, fps: x.framesPerSecond, decoder: x.decoderImplementation, codec: stats.get(x.codecId)?.mimeType };
    });
    return r;
  };
  await new Promise((res) => setTimeout(res, 4000));
  const s1 = await sample();
  await new Promise((res) => setTimeout(res, 3000));
  const s2 = await sample();
  Object.assign(result, { s1, s2, datachannel: dcOk });
  log(`framesDecoded ${s1.framesDecoded} -> ${s2.framesDecoded}  fps=${s2.fps}  codec=${s2.codec}  decoder=${s2.decoder}`);
  const rising = s2.framesDecoded > s1.framesDecoded && s2.framesDecoded > 30;
  log("video decoding: " + (rising ? "frames rising" : "NOT rising"), rising ? "pass" : "fail");

  if (rising && dcOk) verdict(true, "Level L0 is viable: live video + DataChannel.");
  else if (dcOk) verdict(false, "DataChannel works but video does not decode: use fallback L2 (skeleton-only TV).");
  else verdict(false, "WebRTC is unreliable here: use fallback L3 (HTTP polling).");
}

function verdict(pass: boolean, msg: string) {
  result.pass = pass;
  log("\nGATE 0: " + (pass ? "PASS. " : "FAIL. ") + msg, pass ? "pass" : "fail");
  log("\nresult json (copy into docs/PROGRESS.md):\n" + JSON.stringify(result));
}

main().catch((err) => {
  log("probe error: " + (err as Error).message, "fail");
  verdict(false, "Probe crashed; read the console via chrome://inspect.");
});
