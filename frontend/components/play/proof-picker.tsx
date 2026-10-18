"use client";

import { CheckCircle2, ImagePlus } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";

/** Screenshot picker: tap to choose, or drop an image. Shows a preview once chosen. */
export function ProofPicker({ file, onFile, label, hint, invalid, describedBy }: {
  file: File | null; onFile: (f: File) => void; label: string; hint: string; invalid?: boolean; describedBy?: string;
}) {
  const id = useId();
  const [preview, setPreview] = useState("");
  const [drag, setDrag] = useState(false);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const u = URL.createObjectURL(file); setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const pick = (f?: File | null) => { if (f && f.type.startsWith("image/")) onFile(f); };
  return (
    <label htmlFor={id}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
      className={cn("flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed bg-muted/40 p-3 transition-colors duration-150 hover:border-ring/60 hover:bg-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
        drag && "border-ring bg-accent", file && "border-solid border-success/60", invalid && "border-destructive")}>
      <input id={id} type="file" accept="image/*" className="sr-only" aria-describedby={describedBy} aria-invalid={invalid}
        onChange={(e) => pick(e.target.files?.[0])} />
      {preview ? (
        <Image src={preview} alt="Your screenshot" width={48} height={48} unoptimized className="size-12 shrink-0 rounded-md object-cover" />
      ) : <span className="grid size-12 shrink-0 place-items-center rounded-md bg-primary/20 text-brand-text"><ImagePlus className="size-5" aria-hidden /></span>}
      <span className="grid min-w-0 flex-1 gap-0.5">
        <b className="text-sm">{file ? "Screenshot added" : label}</b>
        <span className="text-sm text-muted-foreground">{file ? "Tap to change" : hint}</span>
      </span>
      {file && <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />}
    </label>
  );
}
