"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Promo code that copies itself on click. */
export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1600); toast.success(`Code ${code} copied`); }
    catch { toast.error("Couldn't copy — note the code down."); }
  }
  return (
    <Button type="button" variant="outline" onClick={copy} aria-label={`Copy code ${code}`} className="border-dashed font-mono tracking-widest">
      {code}{copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
    </Button>
  );
}
