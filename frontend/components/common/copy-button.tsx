"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Copy-to-clipboard icon button with a confirmed state (and a toast for screen readers). */
export function CopyButton({ value, label, size = "icon-sm" }: { value: string; label: string; size?: "icon-sm" | "icon-xs" | "icon" }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true); setTimeout(() => setDone(false), 1500);
      toast.success(`${label} copied`);
    } catch { toast.error("Couldn't copy — select it and copy by hand."); }
  }
  return (
    <Button type="button" variant="ghost" size={size} onClick={copy} aria-label={`Copy ${label}`}>
      {done ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
    </Button>
  );
}
