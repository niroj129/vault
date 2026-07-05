"use client";

import Protected from "../../components/Protected";
import ChatPanel from "../../components/ChatPanel";

export default function Page() {
  return (
    <Protected>
      <section className="wrap section">
        <div className="head"><div><span className="kicker">Support</span><h2>💬 Chat with Support</h2></div></div>
        <ChatPanel />
      </section>
    </Protected>
  );
}
