"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, mediaUrl } from "../lib/api";
import { useAuth } from "../lib/auth";

const EMOJIS = ["😀", "😂", "😍", "🤑", "🥳", "🔥", "💰", "🎰", "🎲", "🏆", "👍", "🙏", "❤️", "🎉"];

export default function ChatPanel() {
  const { user, token } = useAuth();
  const isAdmin = user.role === "admin";
  const [inbox, setInbox] = useState([]);
  const [activeUser, setActiveUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const boxRef = useRef(null);

  const loadInbox = useCallback(async () => {
    if (!isAdmin) return;
    try { setInbox(await apiFetch("/chat/inbox/", { token })); } catch {}
  }, [isAdmin, token]);

  const loadConversation = useCallback(async () => {
    try {
      if (isAdmin && !activeUser) return;
      const path = isAdmin ? `/chat/conversation/?user=${activeUser}` : "/chat/conversation/";
      const data = await apiFetch(path, { token });
      setMessages(data.messages);
    } catch {}
  }, [isAdmin, activeUser, token]);

  useEffect(() => { loadInbox(); }, [loadInbox]);
  useEffect(() => { loadConversation(); }, [loadConversation]);
  useEffect(() => {
    const t = setInterval(() => { loadConversation(); loadInbox(); }, 3000);
    return () => clearInterval(t);
  }, [loadConversation, loadInbox]);
  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, [messages]);

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    const payload = { body };
    if (isAdmin) payload.recipient = activeUser;
    try { await apiFetch("/chat/send/", { method: "POST", token, body: payload }); loadConversation(); } catch {}
  }

  return (
    <div className="chat" style={{ gridTemplateColumns: isAdmin ? "300px 1fr" : "1fr" }}>
      {isAdmin && (
        <div className="chat-list">
          {inbox.length ? inbox.map((c) => (
            <div key={c.id} className={`row ${activeUser === c.id ? "active" : ""}`} onClick={() => setActiveUser(c.id)}>
              <div><b>{c.full_name || c.username}</b><div className="muted small">{c.preview}</div></div>
              {c.unread > 0 && <span className="badge">{c.unread}</span>}
            </div>
          )) : <p className="muted small" style={{ padding: "1em" }}>No player messages yet.</p>}
        </div>
      )}

      <div className="chat-main">
        <div className="chat-head">
          {isAdmin ? (activeUser ? "Conversation with player" : "Select a player") : "Tiffany Gaming Support"}
        </div>
        <div className="msgs" ref={boxRef}>
          {messages.map((m) => (
            <div key={m.id} className={`msg ${m.sender === user.id ? "mine" : ""}`}>
              {m.sender !== user.id && <span className="muted small">{m.sender_name}{m.sender_role === "admin" ? " ⭐" : ""}</span>}
              <div className="bubble">{m.body}{m.image && <img src={mediaUrl(m.image)} alt="attachment" />}</div>
              <span className="time">{(m.created_at || "").slice(11, 16)}</span>
            </div>
          ))}
          {!messages.length && <p className="muted center" style={{ marginTop: "2rem" }}>
            {isAdmin && !activeUser ? "Pick a player to view the conversation." : "Say hello 👋 — an agent will reply shortly."}
          </p>}
        </div>
        {(!isAdmin || activeUser) && (
          <form className="chat-input" onSubmit={send}>
            <div style={{ display: "flex", gap: ".1em", alignItems: "center" }}>
              {EMOJIS.slice(0, 6).map((e) => (
                <button type="button" key={e} onClick={() => setText((t) => t + e)}
                  style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer" }}>{e}</button>
              ))}
            </div>
            <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" />
            <button className="btn btn-primary" type="submit">Send</button>
          </form>
        )}
      </div>
    </div>
  );
}
