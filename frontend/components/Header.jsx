"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import CreateAccountButton from "./CreateAccountButton";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import NotificationBell from "./NotificationBell";

export default function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [suggests, setSuggests] = useState([]);

  function search(e) {
    e.preventDefault();
    router.push(`/search?q=${encodeURIComponent(q)}`);
    setSuggests([]); setOpen(false);
  }

  function onType(v) {
    setQ(v);
    if (v.trim().length < 2) { setSuggests([]); return; }
    apiFetch(`/search/suggest/?q=${encodeURIComponent(v)}`).then(setSuggests).catch(() => {});
  }

  function go(slug) {
    setSuggests([]); setQ("");
    router.push(`/${slug}`);
  }

  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <Link href="/" className="brand">
          <Logo size={40} />
          <span className="brand-name">TIFFANY <b>GAMING</b></span>
        </Link>
        <form className="nav-search" onSubmit={search}>
          <span>🔍</span>
          <input value={q} onChange={(e) => onType(e.target.value)} placeholder="Search games…" aria-label="Search games" autoComplete="off" />
          {suggests.length > 0 && (
            <div className="nav-suggest">
              {suggests.map((s) => (
                <button type="button" key={s.slug} onClick={() => go(s.slug)}>🎮 {s.name}</button>
              ))}
            </div>
          )}
        </form>
        <nav className={`nav-links ${open ? "open" : ""}`} onClick={() => setOpen(false)}>
          <Link href="/games">Games</Link>
          <Link href="/promotions">Promotions</Link>
          <Link href="/winners">Winners</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/business">Contact</Link>
          <CreateAccountButton className="btn btn-secondary sm" label="🆕 Create Account" />
          <ThemeToggle />
          {user ? (
            <>
              <NotificationBell />
              <Link href="/chat">Chat</Link>
              {user.role === "admin" ? (
                <Link href="/admin">Admin</Link>
              ) : user.role === "merchant" ? (
                <Link href="/merchant">Merchant</Link>
              ) : (
                <Link href="/dashboard">My Area</Link>
              )}
              <button className="btn btn-ghost sm" onClick={logout}>Logout</button>
            </>
          ) : (
            <Link href="/login" className="btn btn-primary sm">Sign In</Link>
          )}
        </nav>
        <button className="nav-toggle" onClick={() => setOpen((o) => !o)}>☰</button>
      </div>
    </header>
  );
}
