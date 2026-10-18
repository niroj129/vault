"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { errorText } from "@/lib/api";
import { money } from "@/lib/format";
import type { Deposit } from "@/lib/types";

const schema = z.object({ loaded: z.string().refine((v) => Number(v) > 0, "Enter the credits you put on the game.").refine((v) => Number(v) <= 100000, "That looks too high.") });

/** Staff confirm a load and type how many credits actually went on the game.
 *  That number is what the cash-out rule multiplies (when it's set to "credits loaded"). */
export function LoadedDialog({ deposit, paid, username, title, confirmLabel = "Yes, it's loaded", onSubmit, onClose }: {
  deposit: Pick<Deposit, "id" | "amount" | "credit_amount" | "game"> | null; paid?: number; username?: string; title?: string; confirmLabel?: string;
  onSubmit: (loaded: string) => Promise<void>; onClose: () => void;
}) {
  const expected = deposit ? Number(deposit.credit_amount) || Number(paid ?? deposit.amount) : 0;
  const form = useForm<{ loaded: string }>({ resolver: zodResolver(schema), defaultValues: { loaded: "" } });
  const { errors, isSubmitting } = form.formState;
  useEffect(() => { if (deposit) form.reset({ loaded: String(expected) }); }, [deposit, expected, form]);
  const differs = Number(form.watch("loaded")) !== expected;

  async function submit(v: { loaded: string }) {
    try { await onSubmit(v.loaded); onClose(); }
    catch (e) { form.setError("root", { message: errorText(e) }); }
  }
  return (
    <Dialog open={!!deposit} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form noValidate onSubmit={form.handleSubmit(submit)} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{title || `Loaded on ${deposit?.game?.name || "the game"}?`}</DialogTitle>
            <DialogDescription>Only confirm after you&apos;ve added the credits in the game panel{username ? ` for @${username}` : ""}. The player gets a message.</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-muted p-2"><dt className="text-xs text-muted-foreground">Player paid</dt><dd className="font-bold tabular-nums">{money(paid ?? deposit?.amount)}</dd></div>
            <div className="rounded-md bg-muted p-2"><dt className="text-xs text-muted-foreground">Expected credits</dt><dd className="font-bold tabular-nums">{money(expected)}</dd></div>
          </dl>
          <Field data-invalid={!!errors.loaded}>
            <FieldLabel htmlFor={`loaded-${deposit?.id}`}>Credits you loaded</FieldLabel>
            <InputGroup><InputGroupAddon><InputGroupText>$</InputGroupText></InputGroupAddon>
              <InputGroupInput id={`loaded-${deposit?.id}`} type="number" inputMode="decimal" min="0" step="0.01" autoFocus className="tabular-nums"
                aria-invalid={!!errors.loaded} {...form.register("loaded")} /></InputGroup>
            <FieldDescription>{differs ? "Different from what was expected. That's fine; the cash-out limit uses this number." : "Change it if you loaded a different amount. The cash-out limit uses this number."}</FieldDescription>
            <FieldError>{errors.loaded?.message}</FieldError>
          </Field>
          {errors.root && <p role="alert" className="text-sm text-destructive-text">{errors.root.message}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Not yet</Button>
            <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>{isSubmitting ? <Spinner aria-hidden /> : <Check aria-hidden />}{isSubmitting ? "Saving…" : confirmLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
