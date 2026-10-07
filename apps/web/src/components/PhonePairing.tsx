/**
 * Pair Shua on your iPhone: one QR, scanned once. The code carries this Mac's Tailscale address and a
 * private key; the phone keeps it in its Keychain and reaches the crew through the phone door only.
 */
import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { Smartphone } from "lucide-react";
import { Button } from "@shuacrew/ui";
import { api } from "../lib/api";

type Status = { paired: boolean; door: { host: string; port: number } | null; tailnet: string | null };
type Pairing = { v: 1; host: string; port: number; key: string; name: string };

function QrSvg({ text }: { text: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [text]);
  return <div className="phone-qr" aria-label="Pairing code" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function PhonePairing() {
  const [status, setStatus] = useState<Status | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = () => api<Status>("/api/phone/status").then(setStatus).catch(() => setStatus(null));
  useEffect(() => { void refresh(); }, []);

  const show = async () => {
    setError(null);
    try { setCode(JSON.stringify(await api<Pairing>("/api/phone/pair", { body: {} }))); void refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const unpair = async () => {
    await api("/api/phone/unpair", { body: {} }).catch(() => undefined);
    setCode(null);
    void refresh();
  };
  const copy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const ready = !!status?.tailnet;
  return (
    <div className="settings-card phone-pair">
      <div className="phone-pair-head">
        <span className={`phone-pair-dot ${status?.paired ? "is-on" : ""}`} />
        <strong>{status?.paired ? `Paired · door open on ${status.door?.host ?? status.tailnet}` : "Not paired yet"}</strong>
      </div>
      <p>Shua on your iPhone sees what the crew is doing, decides what's waiting and starts work, over Tailscale only. Settings, files and terminals stay on this Mac.</p>
      {!ready && <p className="dim">Turn on Tailscale on this Mac and your iPhone first; the door only listens on your tailnet.</p>}
      {code ? (
        <div className="phone-pair-code">
          <QrSvg text={code} />
          <div className="phone-pair-steps">
            <ol><li>Open ShuaCrew on your iPhone.</li><li>Tap <b>Pair with your Mac</b>.</li><li>Point the camera here.</li></ol>
            <div className="phone-pair-actions">
              <Button size="s" onClick={copy}>{copied ? "Copied" : "Copy code instead"}</Button>
              <Button size="s" variant="ghost" onClick={() => setCode(null)}>Hide</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="phone-pair-actions">
          <Button variant="primary" disabled={!ready} onClick={show}><Smartphone size={15} /> {status?.paired ? "Show code again" : "Pair your iPhone"}</Button>
          {status?.paired && <Button variant="ghost" onClick={unpair}>Unpair</Button>}
        </div>
      )}
      {error && <p className="phone-pair-error">{error}</p>}
    </div>
  );
}
