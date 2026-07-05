"use client";

import ChatPanel from "../../../components/ChatPanel";

export default function AdminChat() {
  return (
    <div>
      <p className="muted small" style={{ marginBottom: "1rem" }}>
        Players can only message support (you). Select a player on the left to reply.
      </p>
      <ChatPanel />
    </div>
  );
}
