import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function Pair({ title, qrUrl, code, status }: { title: string; qrUrl?: string; code?: string; status: string }) {
  const [img, setImg] = useState<string>();
  useEffect(() => {
    if (qrUrl) QRCode.toDataURL(qrUrl, { width: 420, margin: 1, errorCorrectionLevel: "M" }).then(setImg);
  }, [qrUrl]);
  const waiting = !status.startsWith("Pairing failed");

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
          {waiting && <span className="spinner" />}
          {status}
        </p>
        <p className="hint" style={{ marginTop: 18 }}>
          Back to cancel · no app install needed on the phone
        </p>
      </div>
    </main>
  );
}
