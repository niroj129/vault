"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownToLine } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import type { AdminUser, Game, StaffLogin } from "@/lib/types";
import { AGENT_METHODS } from "./pay-methods";

const schema = z.object({ amount: z.string().refine((v) => Number(v) > 0, "Enter an amount above 0."), method: z.string().min(1) });
type Values = z.infer<typeof schema>;

/** Take credits off a player's game account (a cash out you handle yourself). Player-requested cash outs live under Cash outs. */
export function RedeemDialog({ player, game, login, balance, open, onOpenChange, onDone }: {
  player: AdminUser; game: Game; login: StaffLogin; balance: number | null; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void;
}) {
  const { token } = useAuth();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { amount: "", method: "cash" } });
  const { errors, isSubmitting } = form.formState;
  const amount = form.watch("amount");

  async function submit(v: Values) {
    if (balance != null && Number(v.amount) > balance) { form.setError("amount", { message: `They only have ${money(balance)} on ${game.name}.` }); return; }
    try {
      await apiFetch("/admin/game-accounts/", { method: "POST", token, body: { action: "withdraw", login: login.id, amount: v.amount, method: v.method } });
      toast.success(`Took ${money(v.amount)} off ${game.name}. Pay @${player.username} ${money(v.amount)} (${AGENT_METHODS.find((m) => m.value === v.method)?.label}).`);
      form.reset(); onDone(); onOpenChange(false);
    } catch (e) { form.setError("root", { message: errorText(e) }); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isSubmitting) { onOpenChange(o); if (!o) form.reset(); } }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Redeem from {game.name}</DialogTitle>
          <DialogDescription>Takes credits off @{player.username}&apos;s game account right away. Pay them yourself afterwards.</DialogDescription>
        </DialogHeader>
        <form id="redeem-form" noValidate onSubmit={form.handleSubmit(submit)} className="grid gap-4">
          {balance != null && <p className="rounded-lg bg-muted px-3 py-2 text-sm">Balance on {game.name}: <b className="tabular-nums">{money(balance)}</b></p>}
          <Controller control={form.control} name="amount" render={({ field }) => (
            <Field data-invalid={!!errors.amount}>
              <FieldLabel htmlFor="rd-amount">Amount</FieldLabel>
              <InputGroup>
                <InputGroupAddon><InputGroupText>$</InputGroupText></InputGroupAddon>
                <InputGroupInput id="rd-amount" type="number" inputMode="decimal" min="0" step="0.01" autoFocus className="tabular-nums" aria-invalid={!!errors.amount} value={field.value} onChange={(e) => field.onChange(e.target.value)} />
                {balance != null && balance > 0 && <InputGroupAddon align="inline-end"><InputGroupButton type="button" onClick={() => field.onChange(String(balance))}>All</InputGroupButton></InputGroupAddon>}
              </InputGroup>
              <FieldError>{errors.amount?.message}</FieldError>
            </Field>
          )} />
          <Controller control={form.control} name="method" render={({ field }) => (
            <Field><FieldLabel htmlFor="rd-method">Paying them with</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="rd-method" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{AGENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select>
              <FieldDescription>Kept in your records so the numbers match.</FieldDescription></Field>
          )} />
          {errors.root && <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm font-medium text-destructive-text">{errors.root.message}</p>}
        </form>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="redeem-form" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? <><Spinner aria-hidden />Working…</> : <><ArrowDownToLine aria-hidden />Redeem {Number(amount) > 0 ? money(amount) : ""}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
