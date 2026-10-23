import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function Pair({ title, qrUrl, code, status }: { title: string; qrUrl?: string; code?: string; status: string }) {
  const [img, setImg] = useState<string>();
  useEffect(() => {
    if (qrUrl) QRCode.toDataURL(qrUrl, { width: 440, margin: 1, errorCorrectionLevel: "M" }).then(setImg);
  }, [qrUrl]);

  return (
    <main className="pair">
      <div className="pair-qr">{img ? <img src={img} alt="Pairing QR code" /> : <div className="qr-placeholder" />}</div>
      <div className="pair-text">
        <h2>{title}</h2>
        <h1>Scan with your phone</h1>
        <ol>
          <li>Open the camera on your phone and scan the code.</li>
          <li>Tap "Tap to start camera" on the phone.</li>
          <li>Prop the phone up in landscape, 2.5–3 m away, whole body in frame.</li>
        </ol>
        {code && (
          <p className="code">
            Room <b>{code.replace(/(\d{3})(\d{3})/, "$1 $2")}</b>
          </p>
        )}
        <p className="status">{status}</p>
        <p className="hint">Back to cancel</p>
      </div>
    </main>
  );
}
