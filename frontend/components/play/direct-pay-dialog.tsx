"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import type { Deposit, DirectMethod, PlayGame } from "@/lib/types";
import { PayTo } from "./pay-to";
import { ProofPicker } from "./proof-picker";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; method: DirectMethod; amount: string; game: PlayGame; gameUser: string; promoCode?: string; onSent: (ref: string) => void }

/** Pay our own QR: scan or send, add a screenshot, tap "I've paid". Radix Dialog traps and restores focus. */
export function DirectPayDialog({ open, onOpenChange, method, amount, game, gameUser, promoCode, onSent }: Props) {
  const { token, user } = useAuth();
  const needProof = method.proof === "required";
  const schema = z.object({
    proof: needProof ? z.instanceof(File, { message: "Add a screenshot of your payment so we can find it fast." }) : z.instanceof(File).nullable(),
    player_note: z.string().trim().max(200).optional(),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { proof: null as unknown as File, player_note: "" } });
  const { errors, isSubmitting } = form.formState;

  async function submit(v: Values) {
    const fd = new FormData();
    fd.append("pay_method", String(method.id)); fd.append("amount", amount); fd.append("game", String(game.id));
    if (gameUser) fd.append("game_username", gameUser);
    if (promoCode) fd.append("promo_code", promoCode);
    if (v.player_note) fd.append("player_note", v.player_note);
    if (v.proof) fd.append("proof", v.proof);
    try { const d = await apiFetch<Deposit>("/play/deposits/", { method: "POST", token, body: fd }); onSent(d.reference); }
    catch (e) { form.setError("root", { message: errorText(e) }); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <p className="text-xs font-semibold tracking-wider text-brand-text uppercase">{game.name}{gameUser || game.login ? ` · ${game.login?.username || gameUser}` : ""}</p>
          <DialogTitle className="text-xl">Pay {money(amount)} with {method.name}</DialogTitle>
          <DialogDescription>Only tap “I&apos;ve paid” after the money has left your {method.name}. We check every payment by hand, then load {game.name}.</DialogDescription>
        </DialogHeader>
        <ol className="grid grid-cols-3 gap-2 text-sm" aria-label="Steps">
          {[`Scan or send to our ${method.name}`, "Screenshot it", "Tap “I've paid”"].map((t, i) => (
            <li key={t} className="flex items-start gap-2 rounded-md bg-muted p-2 font-medium">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground" aria-hidden>{i + 1}</span>{t}
            </li>
          ))}
        </ol>
        <PayTo name={method.name} handle={method.handle} accountName={method.account_name} qr={method.qr} instructions={method.instructions} amount={amount} username={user?.username} />
        <form id="direct-pay" onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
          <Controller control={form.control} name="proof" render={({ field }) => (
            <Field data-invalid={!!errors.proof}>
              <FieldTitle id="proof-label">Payment screenshot {needProof ? "" : <span className="font-normal text-muted-foreground">(optional)</span>}</FieldTitle>
              <ProofPicker file={field.value || null} onFile={(f) => field.onChange(f)} invalid={!!errors.proof} describedBy="proof-label"
                label="Upload your payment screenshot" hint="The “Payment sent” screen from your app" />
              <FieldError>{errors.proof?.message as string | undefined}</FieldError>
            </Field>
          )} />
          <Field>
            <FieldLabel htmlFor="player-note">Name on your {method.name} <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
            <Input id="player-note" autoComplete="name" maxLength={200} {...form.register("player_note")} />
            <FieldDescription>Helps us match your payment if the screenshot is unclear.</FieldDescription>
          </Field>
          {errors.root && <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm font-medium text-destructive-text">{errors.root.message}</p>}
        </form>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Back</Button>
          <Button type="submit" form="direct-pay" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? <><Spinner aria-hidden />Sending…</> : <><Check aria-hidden />I&apos;ve paid {money(amount)}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
