"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Wallet } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ChoiceCards } from "@/components/play/choice-cards";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import type { AdminUser, Deposit, Game, StaffLogin } from "@/lib/types";
import { AGENT_METHODS, QUICK_AMOUNTS } from "./pay-methods";

const schema = z.object({
  mode: z.enum(["paid", "free"]),
  amount: z.string().refine((v) => Number(v) > 0, "Enter an amount above 0."),
  method: z.string().min(1),
  promo_code: z.string().trim().max(40),
  note: z.string().trim().max(200),
});
type Values = z.infer<typeof schema>;

/** Load a player's game. "Player paid me" records the money (and promo code) so your numbers add up; "Free credits" adds credits with no payment. */
export function LoadDialog({ player, game, login, api, open, onOpenChange, onDone }: {
  player: AdminUser; game: Game; login: StaffLogin | undefined; api: boolean; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void;
}) {
  const { token } = useAuth();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { mode: "paid", amount: "", method: "cash", promo_code: "", note: "" } });
  const { errors, isSubmitting } = form.formState;
  const [mode, amount] = form.watch(["mode", "amount"]);
  const free = mode === "free";

  async function submit(v: Values) {
    try {
      if (v.mode === "free") {
        if (!login) { form.setError("root", { message: "Create their account on this game first." }); return; }
        await apiFetch("/admin/game-accounts/", { method: "POST", token, body: { action: "load", login: login.id, amount: v.amount, method: "staff" } });
        toast.success(`${money(v.amount)} of free credits added to ${game.name}`);
      } else {
        const d = await apiFetch<Deposit>("/admin/deposits/", { method: "POST", token, body: {
          user: player.id, game: game.id, amount: v.amount, method: v.method, note: v.note, ...(v.promo_code ? { promo_code: v.promo_code } : {}) } });
        const credits = money(d.credit_amount || d.amount);
        if (d.load_status === "loaded") toast.success(`Loaded ${credits} on ${game.name}${d.promo_code ? ` (promo ${d.promo_code})` : ""}`);
        else if (d.load_status === "failed") toast.error(`Recorded, but the load failed: ${(d as unknown as { load_error?: string }).load_error || "try again from Loads"}`);
        else toast.success(`Recorded ${money(d.amount)}. Add ${credits} in the game panel, then mark it loaded under Loads.`);
      }
      form.reset(); onDone(); onOpenChange(false);
    } catch (e) { form.setError("root", { message: errorText(e) }); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isSubmitting) { onOpenChange(o); if (!o) form.reset(); } }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Load {game.name}</DialogTitle>
          <DialogDescription>For @{player.username}{login ? ` · ${login.username}` : ""}. {api ? "Credits go on the game right away." : "This game has no API: record it here, then add the credits in the game panel."}</DialogDescription>
        </DialogHeader>
        <form id="load-form" noValidate onSubmit={form.handleSubmit(submit)} className="grid gap-4">
          <Controller control={form.control} name="mode" render={({ field }) => (
            <ChoiceCards label="Type of load" value={field.value} onChange={field.onChange} className="grid-cols-2" choices={[
              { value: "paid", label: "Player paid me", description: "Records the payment" },
              ...(api && login ? [{ value: "free", label: "Free credits", description: "No payment" }] : []),
            ]} />
          )} />
          <Controller control={form.control} name="amount" render={({ field }) => (
            <Field data-invalid={!!errors.amount}>
              <FieldLabel htmlFor="ld-amount">Amount</FieldLabel>
              <InputGroup>
                <InputGroupAddon><InputGroupText>$</InputGroupText></InputGroupAddon>
                <InputGroupInput id="ld-amount" type="number" inputMode="decimal" min="0" step="0.01" autoFocus className="tabular-nums" aria-invalid={!!errors.amount} value={field.value} onChange={(e) => field.onChange(e.target.value)} />
              </InputGroup>
              <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Quick amounts">
                {QUICK_AMOUNTS.map((a) => (
                  <Button key={a} type="button" size="sm" variant={Number(amount) === a ? "default" : "outline"} onClick={() => field.onChange(String(a))} aria-pressed={Number(amount) === a}>${a}</Button>
                ))}
              </div>
              <FieldError>{errors.amount?.message}</FieldError>
            </Field>
          )} />
          {!free && (
            <>
              <Controller control={form.control} name="method" render={({ field }) => (
                <Field><FieldLabel htmlFor="ld-method">Paid with</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="ld-method" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{AGENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></Field>
              )} />
              <Field><FieldLabel htmlFor="ld-promo">Promo code <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
                <Input id="ld-promo" autoComplete="off" autoCapitalize="characters" className="font-mono uppercase" {...form.register("promo_code")} />
                <FieldDescription>Adds the bonus if the player can still use it. A bonus code isn&apos;t needed for automatic promotions.</FieldDescription></Field>
            </>
          )}
          <Field><FieldLabel htmlFor="ld-note">Note <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="ld-note" autoComplete="off" {...form.register("note")} /></Field>
          {errors.root && <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm font-medium text-destructive-text">{errors.root.message}</p>}
        </form>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="load-form" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? <><Spinner aria-hidden />Loading…</> : <><Wallet aria-hidden />Load {Number(amount) > 0 ? money(amount) : ""}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
