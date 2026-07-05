"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

/** Top banner showing the pinned announcement (dismissible per session). */
export default function AnnouncementBar() {
  const [ann, setAnn] = useState(null);
  const [closed, setClosed] = useState(true);

  useEffect(() => {
    apiFetch("/announcements/").then((list) => {
      const pinned = list.find((a) => a.pinned && a.active) || list[0];
      if (pinned && sessionStorage.getItem("tf_annbar") !== String(pinned.id)) {
        setAnn(pinned); setClosed(false);
      }
    }).catch(() => {});
  }, []);

  if (closed || !ann) return null;
  return (
    <div className="annbar">
      📢 <b>{ann.title}</b>{ann.body ? ` — ${ann.body}` : ""}
      <button className="x" onClick={() => { sessionStorage.setItem("tf_annbar", String(ann.id)); setClosed(true); }} aria-label="Dismiss">✕</button>
    </div>
  );
}
