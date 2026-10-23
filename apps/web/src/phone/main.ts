// Phone sensor page entry. Block 1 (camera + MediaPipe pose + rep engine + composited canvas)
// and Block 2 (phoneConnect to the TV) are implemented on top of this skeleton.
const statusEl = document.getElementById("status")!;
const room = new URLSearchParams(location.search).get("room");

if (!window.isSecureContext) {
  statusEl.textContent = "Camera needs HTTPS: open this page over https:// (pnpm dev:phone, or CloudFront).";
} else {
  statusEl.textContent = room ? `Room ${room}: sensor starting…` : "Standalone mode (no room): open from the TV's QR code to pair.";
}

export {};
