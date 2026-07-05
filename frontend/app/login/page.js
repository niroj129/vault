"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Logo from "../../components/Logo";
import { useAuth } from "../../lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    const f = new FormData(e.target);
    try {
      const user = await login(f.get("username"), f.get("password"));
      router.push(user.role === "admin" ? "/admin" : "/dashboard");
    } catch {
      setErr("Incorrect username or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="center" style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "inline-block" }}><Logo size={56} /></div>
          <h1 style={{ marginTop: ".5rem", fontSize: "1.4rem" }}>TIFFANY GAMING</h1>
          <p className="muted small">Sign in to access game links & chat</p>
        </div>
        {err && <div className="alert err">{err}</div>}
        <form onSubmit={submit}>
          <label>Username<input name="username" required autoFocus autoComplete="username" /></label>
          <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
          <button className="btn btn-primary full lg" disabled={busy}>{busy ? "Signing in…" : "Sign In →"}</button>
        </form>
        <p className="muted small center" style={{ marginTop: "1rem" }}>
          Accounts are created by administrators. No public sign-up.
        </p>
      </div>
    </div>
  );
}
