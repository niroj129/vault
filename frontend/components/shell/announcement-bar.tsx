"use client";

import { Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import type { Announcement } from "@/lib/types";

/** Slim strip with the pinned announcement (dismissible for this visit). */
export function AnnouncementBar() {
  const [ann, setAnn] = useState<Announcement | null>(null);

  useEffect(() => {
    apiFetch<Announcement[]>("/announcements/").then((list) => {
      const pinned = list.find((a) => a.pinned && a.active);
      let dismissed: string | null = null;
      try { dismissed = sessionStorage.getItem("annbar"); } catch { /* ignore */ }
      if (pinned && dismissed !== String(pinned.id)) setAnn(pinned);
    }).catch(() => {});
  }, []);

  if (!ann) return null;
  return (
    <div role="region" aria-label="Announcement" className="flex min-h-11 items-center gap-2 border-b bg-primary/15 px-4 py-2 text-sm sm:justify-center">
      <Sparkles className="size-4 shrink-0 text-brand-text" aria-hidden />
      <p className="line-clamp-2"><b className="font-semibold text-brand-text">{ann.title}</b>{ann.body ? <span> — {ann.body}</span> : null}</p>
      <Button variant="ghost" size="icon-sm" className="ml-auto shrink-0 sm:absolute sm:right-2" aria-label="Dismiss announcement"
        onClick={() => { try { sessionStorage.setItem("annbar", String(ann.id)); } catch { /* ignore */ } setAnn(null); }}>
        <X aria-hidden />
      </Button>
    </div>
  );
}
