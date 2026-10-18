"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownToLine, Wallet } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AGENT_METHODS, QUICK_AMOUNTS } from "@/components/agent/pay-methods";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import type { Platform } from "@/lib/types";

const schema = z.object({ amount: z.string().refine((v) => Number(v) > 0, "Enter an amount above 0."), method: z.string().min(1), note: z.string().trim().max(200) });
type Values = z.infer<typeof schema>;

/** Load or redeem any account on the platform straight by its game login — no site player involved. It's written to the game ledger. */
export function DirectMoveDialog({ platform, username, kind, balance, open, onOpenChange, onDone }: {
  platform: Platform; username: string; kind: "load" | "withdraw"; balance: number | null; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void;
}) {
  const { token } = useAuth();
  const load = kind === "load";
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { amount: "", method: "cash", note: "" } });
  const { errors, isSubmitting } = form.formState;
  const amount = form.watch("amount");

  async function submit(v: Values) {
    if (!load && balance != null && Number(v.amount) > balance) { form.setError("amount", { message: `They only have ${money(balance)}.` }); return; }
    try {
      await apiFetch(`/admin/platforms/${platform.id}/account/`, { method: "POST", token, body: { username, action: kind, amount: v.amount, method: v.method, note: v.note } });
      toast.success(load ? `Loaded ${money(v.amount)} on ${username}` : `Took ${money(v.amount)} off ${username}. Pay them ${money(v.amount)} yourself.`);
      form.reset(); onDone(); onOpenChange(false);
    } catch (e) { form.setError("root", { message: errorText(e) }); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isSubmitting) { onOpenChange(o); if (!o) form.reset(); } }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{load ? "Load" : "Redeem from"} {username}</DialogTitle>
          <DialogDescription>{load ? `Adds credits to ${username} on ${platform.name} right away.` : `Takes credits off ${username} on ${platform.name} right away. Pay them yourself afterwards.`}</DialogDescription>
        </DialogHeader>
        <form id="direct-move" noValidate onSubmit={form.handleSubmit(submit)} className="grid gap-4">
          {balance != null && <p className="rounded-lg bg-muted px-3 py-2 text-sm">Balance now: <b className="tabular-nums">{money(balance)}</b></p>}
          <Controller control={form.control} name="amount" render={({ field }) => (
            <Field data-invalid={!!errors.amount}>
              <FieldLabel htmlFor="dm-amount">Amount</FieldLabel>
              <InputGroup>
                <InputGroupAddon><InputGroupText>$</InputGroupText></InputGroupAddon>
                <InputGroupInput id="dm-amount" type="number" inputMode="decimal" min="0" step="0.01" autoFocus className="tabular-nums" aria-invalid={!!errors.amount} value={field.value} onChange={(e) => field.onChange(e.target.value)} />
                {!load && balance != null && balance > 0 && <InputGroupAddon align="inline-end"><InputGroupButton type="button" onClick={() => field.onChange(String(balance))}>All</InputGroupButton></InputGroupAddon>}
              </InputGroup>
              {load && (
                <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Quick amounts">
                  {QUICK_AMOUNTS.map((a) => <Button key={a} type="button" size="sm" variant={Number(amount) === a ? "default" : "outline"} aria-pressed={Number(amount) === a} onClick={() => field.onChange(String(a))}>${a}</Button>)}
                </div>
              )}
              <FieldError>{errors.amount?.message}</FieldError>
            </Field>
          )} />
          <Controller control={form.control} name="method" render={({ field }) => (
            <Field><FieldLabel htmlFor="dm-method">{load ? "Paid with" : "Paying them with"}</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="dm-method" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{AGENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></Field>
          )} />
          <Field><FieldLabel htmlFor="dm-note">Note <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="dm-note" autoComplete="off" {...form.register("note")} /></Field>
          {errors.root && <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm font-medium text-destructive-text">{errors.root.message}</p>}
        </form>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="direct-move" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? <><Spinner aria-hidden />Working…</> : <>{load ? <Wallet aria-hidden /> : <ArrowDownToLine aria-hidden />}{load ? "Load" : "Redeem"} {Number(amount) > 0 ? money(amount) : ""}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
