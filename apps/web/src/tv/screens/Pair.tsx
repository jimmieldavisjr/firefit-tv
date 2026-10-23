import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import QRCode from "qrcode";

const TIPS = [
  "Put the TV and phone on the same main Wi-Fi, not a guest network",
  "Some mesh and office networks block device-to-device video: try your phone's hotspot",
  "Keep the phone page open with the screen on",
];

export function Pair({ title, qrUrl, code, status, failed }: { title: string; qrUrl?: string; code?: string; status: string; failed?: string }) {
  const [img, setImg] = useState<string>();
  useEffect(() => {
    if (qrUrl) QRCode.toDataURL(qrUrl, { width: 420, margin: 1, errorCorrectionLevel: "M" }).then(setImg);
  }, [qrUrl]);
  if (failed)
    return (
      <main className="pair glass blur failed">
        <div className="pair-text">
          <h2>{title}</h2>
          <h1>Couldn't connect</h1>
          <p className="fail-why">{failed}</p>
          <div className="steps">
            {TIPS.map((t, i) => (
              <div className="s" key={t}>
                <span className="n">{i + 1}</span> {t}
              </div>
            ))}
          </div>
          <div className="start-btn on">
            <RotateCw size={30} /> Re-pair
          </div>
          <p className="hint" style={{ marginTop: 22 }}>
            Select: new pairing code · Back: library
          </p>
        </div>
      </main>
    );

  return (
    <main className="pair glass blur">
      <div className="pair-qr">{img ? <img src={img} alt="Pairing QR code" /> : <div className="qr-placeholder" />}</div>
      <div className="pair-text">
        <h2>{title}</h2>
        <h1>Scan with your phone</h1>
        <div className="steps">
          <div className="s">
            <span className="n">1</span> Point your phone's camera at the code
          </div>
          <div className="s">
            <span className="n">2</span> Tap "Tap to start camera" on the phone
          </div>
          <div className="s">
            <span className="n">3</span> Prop it up in landscape, 2.5–3 m away, whole body in frame
          </div>
        </div>
        {code && (
          <p className="code">
            Room<b className="num">{code.replace(/(\d{3})(\d{3})/, "$1 $2")}</b>
          </p>
        )}
        <p className="status">
          <span className="spinner" />
          {status}
        </p>
        <p className="hint" style={{ marginTop: 18 }}>
          Back to cancel · no app install needed on the phone
        </p>
      </div>
    </main>
  );
}
