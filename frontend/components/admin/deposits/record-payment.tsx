"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { UserAvatar } from "@/components/common/user-avatar";
import { ProofPicker } from "@/components/play/proof-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AdminUser, Game } from "@/lib/types";

const schema = z.object({
  game: z.string().min(1, "Choose a game."),
  amount: z.string().refine((v) => Number(v) > 0, "Enter an amount above 0."),
  method: z.string().trim().min(1, "How did they pay?").max(20),
  note: z.string().max(200).optional(),
  promo_code: z.string().trim().max(40).optional(),
  proof: z.instanceof(File).nullable(),
});
type Values = z.infer<typeof schema>;

/** Staff record money taken outside the site (cash, an agent's app) and load it. */
export function RecordPayment({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<AdminUser[]>([]);
  const [player, setPlayer] = useState<AdminUser | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { game: "", amount: "", method: "cash", note: "", promo_code: "", proof: null } });
  useEffect(() => { apiFetch<Game[]>("/games/", { token }).then(setGames).catch(() => {}); }, [token]);
  useEffect(() => {
    const t = setTimeout(() => apiFetch<AdminUser[]>("/users/?role=user", { token })
      .then((rows) => setPeople(rows.filter((u) => !q || `${u.username} ${u.full_name}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8))).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q, token]);

  async function save(v: Values) {
    if (!player) return;
    const fd = new FormData();
    fd.append("user", String(player.id)); fd.append("game", v.game); fd.append("amount", v.amount); fd.append("method", v.method); fd.append("note", v.note || ""); if (v.promo_code) fd.append("promo_code", v.promo_code);
    if (v.proof) fd.append("proof", v.proof);
    try { await apiFetch("/admin/deposits/", { method: "POST", token, body: fd }); toast.success(`Recorded for @${player.username}`); onDone(); }
    catch (e) { form.setError("root", { message: errorText(e) }); }
  }
  const { errors, isSubmitting } = form.formState;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>For money taken outside the site (cash, an agent&apos;s app). Games with an API are loaded right away; others go to To load.</DialogDescription></DialogHeader>
        {!player ? (
          <div className="grid gap-3">
            <InputGroup><InputGroupAddon><Search aria-hidden /></InputGroupAddon>
              <InputGroupInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a player" aria-label="Find a player" /></InputGroup>
            <ul className="grid gap-1" aria-label="Players">{people.map((u) => (
              <li key={u.id}><button type="button" onClick={() => setPlayer(u)} className="flex min-h-14 w-full items-center gap-3 rounded-md p-2 text-left hover:bg-accent">
                <UserAvatar name={u.full_name || u.username} size={36} /><span className="grid"><b>{u.full_name || u.username}</b><span className="text-sm text-muted-foreground">@{u.username}</span></span></button></li>
            ))}</ul>
          </div>
        ) : (
          <form noValidate onSubmit={form.handleSubmit(save)}>
            <FieldGroup>
              <div className="flex items-center gap-3 rounded-md bg-muted p-2"><UserAvatar name={player.full_name || player.username} size={36} /><b className="flex-1">@{player.username}</b>
                <Button type="button" variant="link" size="sm" onClick={() => setPlayer(null)}>Change</Button></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller control={form.control} name="game" render={({ field }) => (
                  <Field data-invalid={!!errors.game}><FieldLabel htmlFor="rp-game">Game</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="rp-game" className="w-full" aria-invalid={!!errors.game}><SelectValue placeholder="Choose…" /></SelectTrigger>
                      <SelectContent>{games.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}{g.provider_name ? "" : " (by hand)"}</SelectItem>)}</SelectContent></Select>
                    <FieldError>{errors.game?.message}</FieldError></Field>
                )} />
                <Field data-invalid={!!errors.amount}><FieldLabel htmlFor="rp-amount">Amount ($)</FieldLabel>
                  <Input id="rp-amount" type="number" inputMode="decimal" min="0" step="0.01" aria-invalid={!!errors.amount} {...form.register("amount")} /><FieldError>{errors.amount?.message}</FieldError></Field>
                <Field data-invalid={!!errors.method}><FieldLabel htmlFor="rp-method">Paid with</FieldLabel><Input id="rp-method" {...form.register("method")} /><FieldError>{errors.method?.message}</FieldError></Field>
                <Field><FieldLabel htmlFor="rp-note">Note <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="rp-note" {...form.register("note")} /></Field>
                <Field className="sm:col-span-2"><FieldLabel htmlFor="rp-promo">Promo code <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
                  <Input id="rp-promo" autoComplete="off" autoCapitalize="characters" className="font-mono uppercase" {...form.register("promo_code")} />
                  <FieldDescription>Adds the code&apos;s bonus credits to this load, if the player can still use it.</FieldDescription></Field>
              </div>
              <Controller control={form.control} name="proof" render={({ field }) => (
                <Field><FieldTitle>Payment screenshot <span className="font-normal text-muted-foreground">(optional)</span></FieldTitle>
                  <ProofPicker file={field.value} onFile={field.onChange} label="Upload a screenshot" hint="Kept with the record" /></Field>
              )} />
              {errors.root && <p role="alert" className="text-sm text-destructive-text">{errors.root.message}</p>}
              <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>{isSubmitting ? "Saving…" : "Record & load"}</Button></DialogFooter>
            </FieldGroup>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
