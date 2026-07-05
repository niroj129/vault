"use client";

import { useState } from "react";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export default function PingModal({ player, onClose }) {
  const { token } = useAuth();
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.target);
    try {
      const r = await apiFetch("/players/ping/", { method: "POST", token, body: {
        user: player.id, channel: f.get("channel"),
        subject: f.get("subject"), message: f.get("message"),
      } });
      setResult(r);
    } catch (err) { setResult({ error: err.data?.detail || "Failed" }); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target.classList.contains("modal-bg") && onClose()}>
      <form className="modal" onSubmit={send}>
        <div className="modal-head"><h3>📨 Ping {player.username}</h3><button type="button" className="ibtn" onClick={onClose}>✕</button></div>
        <p className="muted small">Email: {player.email || "none"} · Phone: {player.phone || "none"}</p>
        {result && (result.error ? <div className="alert err small">{result.error}</div> :
          <div className="alert ok small">Email: {result.email || "—"} · SMS: {result.sms || "—"}</div>)}
        <label>Channel
          <select name="channel"><option value="email">Email</option><option value="sms">SMS</option><option value="both">Both</option></select>
        </label>
        <label>Subject<input name="subject" defaultValue="A message from Tiffany Gaming" /></label>
        <label>Message<textarea name="message" rows="3" required placeholder="Come back and claim your bonus!" /></label>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Sending…" : "Send Ping"}</button>
        </div>
      </form>
    </div>
  );
}
