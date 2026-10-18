"use client";

import { Check } from "lucide-react";
import { RadioGroup as RadioPrimitive } from "radix-ui";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Choice { value: string; label: ReactNode; description?: ReactNode; media?: ReactNode; aside?: ReactNode }

/** Single-choice cards on a Radix radio group: arrow keys move, Space selects, one tab stop.
 * The label names each option; the description is linked with aria-describedby. Text wraps, never truncates. */
export function ChoiceCards({ label, value, onChange, choices, className, variant = "card" }: {
  label: string; value: string | undefined; onChange: (v: string) => void; choices: Choice[]; className?: string;
  /** "card": media + text + check; "chip": centred text only (amounts) */
  variant?: "card" | "chip";
}) {
  const uid = useId();
  return (
    <RadioPrimitive.Root aria-label={label} value={value ?? ""} onValueChange={onChange} loop className={cn("grid gap-2", className)}>
      {choices.map((c, i) => {
        const lid = `${uid}-${i}-l`, did = `${uid}-${i}-d`;
        return (
          <RadioPrimitive.Item key={c.value} value={c.value} aria-labelledby={lid} aria-describedby={c.description ? did : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg border bg-muted/40 text-left transition-[border-color,background-color,box-shadow] duration-150 ease-out",
              "hover:border-ring/50 hover:bg-accent data-[state=checked]:border-primary data-[state=checked]:ring-2 data-[state=checked]:ring-primary/30",
              variant === "chip" ? "min-h-11 justify-center px-2 py-2 font-semibold data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                : "min-h-14 px-3 py-2.5 data-[state=checked]:bg-primary/10")}>
            {c.media}
            {variant === "chip" ? <span id={lid}>{c.label}</span> : (
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span id={lid} className="font-semibold leading-snug break-words">{c.label}</span>
                {c.description && <span id={did} className="text-sm leading-snug break-words text-muted-foreground">{c.description}</span>}
              </span>
            )}
            {c.aside}
            {variant === "card" && (
              <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full border border-input transition-colors duration-150 group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary group-data-[state=checked]:text-primary-foreground">
                <Check className="size-3 opacity-0 group-data-[state=checked]:opacity-100" strokeWidth={3} />
              </span>
            )}
          </RadioPrimitive.Item>
        );
      })}
    </RadioPrimitive.Root>
  );
}
