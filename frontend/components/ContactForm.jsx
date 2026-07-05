"use client";

import { useState } from "react";
import { apiFetch } from "../lib/api";

export default function ContactForm() {
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    const f = new FormData(e.target);
    try {
      await apiFetch("/contact/", {
        method: "POST",
        body: {
          name: f.get("name"), email: f.get("email"),
          phone: f.get("phone"), message: f.get("message"),
        },
      });
      setSent(true);
    } catch {
      setErr("Could not send. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <div className="alert ok">Thanks! Your message has been received — we'll be in touch shortly.</div>;

  return (
    <form onSubmit={submit}>
      {err && <div className="alert err">{err}</div>}
      <label>Your Name<input name="name" required /></label>
      <label>Email<input name="email" type="email" /></label>
      <label>Phone / WhatsApp<input name="phone" /></label>
      <label>Message<textarea name="message" rows="4" required /></label>
      <button className="btn btn-primary full" disabled={busy}>{busy ? "Sending…" : "Send Message"}</button>
    </form>
  );
}
