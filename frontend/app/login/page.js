"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Logo from "../../components/Logo";
import { useAuth } from "../../lib/auth";

const CHIPS = ["🪙", "🎰", "💎", "🃏", "🎲", "🪙", "💰"];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ username: "", password: "" });

  const valid = form.username.trim() && form.password.length >= 1;

  async function submit(e) {
    e.preventDefault();
    if (!valid) { setErr("Enter your username and password."); return; }
    setBusy(true); setErr("");
    try {
      const user = await login(form.username.trim(), form.password);
      router.push(user.role === "admin" ? "/admin"
        : user.role === "merchant" ? "/merchant" : "/dashboard");
    } catch {
      setErr("Incorrect username or password.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-split">
      {/* animated casino brand panel */}
      <aside className="auth-brand" aria-hidden="true">
        <div className="auth-aurora" />
        <div className="auth-chips">
          {CHIPS.map((c, i) => <span key={i} style={{ "--i": i }}>{c}</span>)}
        </div>
        <div className="auth-brand-inner">
          <Logo size={68} />
          <h2 className="display">TIFFANY GAMING</h2>
          <p>Keep playing, keep winning — your journey to success starts with each bet.</p>
          <ul className="auth-perks">
            <li>⚡ Instant loads &amp; cashouts</li>
            <li>🎧 24/7 live support</li>
            <li>✅ Verified agents</li>
          </ul>
        </div>
      </aside>

      {/* form panel */}
      <main className="auth-panel">
        <form className="auth-form-card" onSubmit={submit} noValidate>
          <div className="auth-mobile-logo"><Logo size={52} /></div>
          <h1>Welcome back</h1>
          <p className="muted">Sign in to access game links, chat &amp; your dashboard.</p>
          {err && <div className="alert err" role="alert">{err}</div>}
          <label>Username
            <input name="username" autoFocus autoComplete="username" value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="your username" />
          </label>
          <label>Password
            <div className="pw-field">
              <input name="password" type={show ? "text" : "password"} autoComplete="current-password"
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
              <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}>{show ? "🙈" : "👁️"}</button>
            </div>
          </label>
          <button className="btn btn-primary full lg" disabled={busy || !valid} style={{ marginTop: ".4rem" }}>
            {busy ? <span className="spinner" aria-label="Signing in" /> : "Sign In →"}
          </button>
          <p className="muted small center" style={{ marginTop: "1.1rem" }}>
            Accounts are created by administrators. No public sign-up.
          </p>
        </form>
      </main>
    </div>
  );
}
