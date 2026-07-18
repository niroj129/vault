"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, mediaUrl } from "../lib/api";
import { useAuth } from "../lib/auth";
import CreateAccountButton from "./CreateAccountButton";

/** Small floating support chat box for players (bottom-right, click to open). */
export default function ChatWidget() {
  const { user, token, ready } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState(0);
  const boxRef = useRef(null);
  const EMOJIS = ["👋", "😀", "🤑", "🔥", "🎰", "💰", "🙏", "👍"];

  const load = useCallback(async () => {
    if (!token || !user || user.role === "admin") return;
    try { const d = await apiFetch("/chat/conversation/", { token }); setMessages(d.messages); } catch {}
  }, [token, user]);

  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => {
    if (!open) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [open, load]);

  // unread support-reply badge (from notifications linked to /chat)
  const pollUnread = useCallback(() => {
    if (!token || !user || user.role === "admin" || open) return;
    apiFetch("/notifications/", { token })
      .then((n) => setUnread(n.filter((x) => !x.is_read && x.link === "/chat").length))
      .catch(() => {});
  }, [token, user, open]);
  useEffect(() => { pollUnread(); const t = setInterval(pollUnread, 12000); return () => clearInterval(t); }, [pollUnread]);
  useEffect(() => { if (open) setUnread(0); }, [open]);
  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, [messages, open]);

  // Hide on admin console and on the full chat page.
  if (!ready) return null;
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/merchant") || pathname === "/login") return null;
  if (user?.role === "admin" || user?.role === "merchant") return null;

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    try { await apiFetch("/chat/send/", { method: "POST", token, body: { body } }); load(); } catch {}
  }

  return (
    <>
      {open && (
        <div className="chatbox">
          <div className="chatbox-head">
            <b>💬 Tiffany Support</b>
            <button className="x" onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
          </div>
          <div className="chatbox-cta">
            <span>🆕 New here?</span>
            <CreateAccountButton className="btn btn-primary sm" label="Create Account" />
          </div>
          {user ? (
            <>
              <div className="chatbox-msgs" ref={boxRef}>
                {messages.map((m) => (
                  <div key={m.id} className={`msg ${m.sender === user.id ? "mine" : ""}`}>
                    <div className="bubble">{m.body}{m.image && <img src={mediaUrl(m.image)} alt="" />}</div>
                    <span className="time">{(m.created_at || "").slice(11, 16)}</span>
                  </div>
                ))}
                {!messages.length && <p className="muted small center" style={{ marginTop: "1rem" }}>👋 Hi! How can an agent help you today?</p>}
              </div>
              <div style={{ display: "flex", gap: ".1em", padding: "0 .6rem", flexWrap: "wrap" }}>
                {EMOJIS.map((e) => <button type="button" key={e} onClick={() => setText((t) => t + e)} style={{ background: "none", border: "none", fontSize: "1.1rem", cursor: "pointer" }}>{e}</button>)}
              </div>
              <form className="chatbox-input" onSubmit={send}>
                <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" />
                <button className="btn btn-primary sm" type="submit">➤</button>
              </form>
            </>
          ) : (
            <div className="chatbox-login">
              <p>Sign in to chat directly with an agent.</p>
              <Link href="/login" className="btn btn-primary" onClick={() => setOpen(false)}>Sign In</Link>
            </div>
          )}
        </div>
      )}
      <button className="fab" onClick={() => setOpen((o) => !o)} aria-label="Chat with support">
        {open ? "✕" : "💬"}
        {!open && unread > 0 && <span className="fab-badge">{unread}</span>}
      </button>
    </>
  );
}
