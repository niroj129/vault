"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Clock, Gamepad2, Info, KeyRound, MessageCircle, Wallet, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loadLine, quickAmounts, rangeText, ruleSummary } from "@/lib/cashout";
import { money, shortDate } from "@/lib/format";
import { payDot, payHandleHint, payLabel } from "@/lib/pay-brands";
import type { PlayOptions, Redeem } from "@/lib/types";
import { ChoiceCards } from "./choice-cards";
import { ProofPicker } from "./proof-picker";
import { StatusBadge, redeemTone } from "./status-badge";

export function RedeemForm({ opts, preselect, onRequested }: { opts: PlayOptions; preselect: number | null; onRequested?: () => void }) {
  const { token } = useAuth();
  const games = useMemo(() => opts.games.filter((g) => g.login), [opts.games]);
  const methods = opts.redeem.methods;
  const min = Number(opts.redeem.min || 0);
  const [rows, setRows] = useState<Redeem[] | null>(null);
  const [bal, setBal] = useState<string | null>(null);
  const proofMode = opts.redeem.proof;
  const [shot, setShot] = useState<File | null>(null);

  const schema = z.object({
    game: z.string().min(1, "Choose a game."),
    amount: z.string().refine((v) => Number(v) >= min, `The minimum cash out is ${money(min)}.`),
    payout_method: z.string().min(1, "Choose where to send it."),
    payout_handle: z.string().trim().min(2, "Enter where we should send the money.").max(120),
  }).superRefine((v, ctx) => {
    // cash-out rule: inside the range allowed by the last load on this game
    const r = games.find((g) => String(g.id) === v.game)?.cashout;
    if (!r?.enabled) return;
    if (!r.ok) { ctx.addIssue({ code: "custom", path: ["game"], message: r.reason }); return; }
    const n = Number(v.amount);
    if (n && (n < Number(r.min) || (r.max != null && n > Number(r.max))))
      ctx.addIssue({ code: "custom", path: ["amount"], message: `For this game you can cash out ${rangeText(r)}.` });
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), mode: "onTouched",
    defaultValues: { game: String(preselect && games.some((g) => g.id === preselect) ? preselect : games[0]?.id ?? ""), amount: "", payout_method: methods[0] || "", payout_handle: "" } });
  const { errors, isSubmitting } = form.formState;
  const [gameId, amount, method] = form.watch(["game", "amount", "payout_method"]);
  const game = games.find((g) => String(g.id) === gameId);
  const rule = game?.cashout?.enabled ? game.cashout : null;
  const blocked = !!rule && !rule.ok;

  const loadRows = useCallback(() => apiFetch<Redeem[]>("/play/redeems/", { token }).then(setRows).catch(() => setRows([])), [token]);
  useEffect(() => { void loadRows(); }, [loadRows]);
  useEffect(() => {
    setBal(null);
    if (game?.login && game.automated) apiFetch<{ balance: string }>(`/play/accounts/${game.login.id}/balance/`, { token }).then((r) => setBal(r.balance)).catch(() => {});
  }, [game, token]);
  // fill in the handle used last time for this method
  useEffect(() => {
    const last = (rows || []).find((r) => r.payout_method === method);
    form.setValue("payout_handle", last ? last.payout_handle : "");
  }, [method, rows, form]);

  async function submit(v: Values) {
    if (proofMode === "required" && !shot) {
      form.setError("root", { message: "Attach a screenshot of your game balance." });
      document.getElementById("cashout-shot")?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    try {
      const body = new FormData();
      Object.entries({ ...v, payout_handle: v.payout_handle.trim() }).forEach(([k, val]) => body.append(k, String(val)));
      if (shot) body.append("proof", shot);
      await apiFetch("/play/redeems/", { method: "POST", token, body });
      toast.success("Cash out requested", { description: `We'll redeem ${money(v.amount)} from ${game?.name} and send it to your ${payLabel(v.payout_method)}. You'll get a message at each step.` });
      form.reset({ ...v, amount: "" }); setShot(null);
      void loadRows(); onRequested?.(); // that load is now used: refresh the allowed range
    } catch (e) { form.setError("root", { message: errorText(e) }); }
  }

  if (!opts.redeem.enabled) {
    return <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Wallet aria-hidden /></EmptyMedia><EmptyTitle>Cash outs go through support</EmptyTitle>
      <EmptyDescription>Message us with the game and amount.</EmptyDescription></EmptyHeader>
      <EmptyContent><Button asChild><Link href="/messages?c=support"><MessageCircle aria-hidden />Message support</Link></Button></EmptyContent></Empty>;
  }
  if (!games.length) {
    return <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><KeyRound aria-hidden /></EmptyMedia><EmptyTitle>No game accounts yet</EmptyTitle>
      <EmptyDescription>Load a game first — then you can cash out from it here.</EmptyDescription></EmptyHeader>
      <EmptyContent><Button asChild><Link href="/load">Load a game</Link></Button></EmptyContent></Empty>;
  }
  const quick = quickAmounts(game?.cashout, min);
  const waiting = (rows || []).filter((r) => r.status === "pending" || r.status === "approved");

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid gap-4">
      <Card className="glass">
        <CardHeader><CardTitle className="text-lg"><h2>1 · Cash out from</h2></CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Controller control={form.control} name="game" render={({ field }) => (
            <ChoiceCards label="Game" value={field.value} onChange={field.onChange} className="sm:grid-cols-2 xl:grid-cols-3"
              choices={games.map((g) => ({ value: String(g.id), label: g.name,
                description: <>{g.login?.username}{g.cashout?.enabled && <> · {g.cashout.ok ? `up to ${money(g.cashout.max)}` : "load first"}</>}</>,
                media: <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                  {g.thumbnail ? <Image src={mediaUrl(g.logo || g.thumbnail)} alt="" fill sizes="44px" className="object-cover" /> : <Gamepad2 className="size-5" aria-hidden />}</span> }))} />
          )} />
          {bal !== null && <p className="text-sm text-muted-foreground">Balance on {game?.name}: <b className="text-foreground tabular-nums">{money(bal)}</b></p>}
          {rule && (blocked ? (
            <Alert className="border-warning/60 bg-warning/10">
              <Zap className="text-warning" aria-hidden />
              <AlertTitle>You can&apos;t cash out from {game?.name} yet</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">{rule.reason}
                <Button asChild size="sm"><Link href={`/load?game=${game?.id}`}>Load {game?.name}<ArrowRight aria-hidden /></Link></Button></AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <Info aria-hidden />
              <AlertTitle>You can cash out {rangeText(rule)}</AlertTitle>
              <AlertDescription>
                Your last load{rule.load?.loaded_at ? ` (${shortDate(rule.load.loaded_at)})` : ""}: {loadLine(rule)}. Cash outs are {ruleSummary(rule)}, one cash out per load.
              </AlertDescription>
            </Alert>
          ))}
          <div className="grid gap-3">
            <h2 className="text-lg font-semibold">2 · Amount <span className="text-sm font-normal text-muted-foreground">{rule && !blocked ? rangeText(rule) : `min ${money(min)}`}</span></h2>
            <Controller control={form.control} name="amount" render={({ field }) => (
              <>
                {quick.length > 0 && <ChoiceCards label="Amount" value={quick.map(String).includes(field.value) ? field.value : undefined} onChange={field.onChange} variant="chip"
                  className={quick.length === 3 ? "grid-cols-3" : "grid-cols-4"} choices={quick.map((a) => ({ value: String(a), label: <span className="tabular-nums">{money(a)}</span> }))} />}
                <Field data-invalid={!!errors.amount}>
                  <FieldLabel htmlFor="redeem-amount">Or enter an amount</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon><InputGroupText>$</InputGroupText></InputGroupAddon>
                    <InputGroupInput id="redeem-amount" type="number" inputMode="numeric" min={rule && !blocked ? Number(rule.min) : min} max={rule?.max != null ? Number(rule.max) : undefined} step="1" value={field.value} disabled={blocked} onChange={(e) => field.onChange(e.target.value)}
                      onBlur={field.onBlur} placeholder={rule && !blocked && rule.max != null ? `${Number(rule.min)} to ${Number(rule.max)}` : `${min} or more`} aria-invalid={!!errors.amount} className="tabular-nums" />
                  </InputGroup>
                  <FieldError>{errors.amount?.message}</FieldError>
                </Field>
              </>
            )} />
          </div>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader><CardTitle className="text-lg"><h2>3 · Send it to</h2></CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Controller control={form.control} name="payout_method" render={({ field }) => (
            <ChoiceCards label="Payout method" value={field.value} onChange={field.onChange} className="grid-cols-1 xs:grid-cols-2 md:grid-cols-3"
              choices={methods.map((x) => ({ value: x, label: payLabel(x),
                media: <span className="size-3.5 shrink-0 rounded-sm ring-1 ring-foreground/20" style={{ background: payDot(x) }} aria-hidden /> }))} />
          )} />
          <Field data-invalid={!!errors.payout_handle}>
            <FieldLabel htmlFor="payout-handle">Your {payLabel(method || "")}</FieldLabel>
            <Input id="payout-handle" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={payHandleHint(method || "")}
              aria-invalid={!!errors.payout_handle} {...form.register("payout_handle")} />
            <FieldDescription>Double-check it — we send the money exactly here.</FieldDescription>
            <FieldError>{errors.payout_handle?.message}</FieldError>
          </Field>
          {proofMode !== "off" && (
            <div id="cashout-shot" className="grid scroll-mt-24 gap-2">
              <h3 className="text-sm font-semibold">Screenshot of your game balance {proofMode === "optional" && <span className="font-normal text-muted-foreground">(optional)</span>}</h3>
              <ProofPicker file={shot} onFile={setShot} label="Add a screenshot" hint="Show your balance in the game so staff can redeem it faster" invalid={proofMode === "required" && !shot && !!errors.root} />
              {proofMode === "required" && !shot && errors.root && <p role="alert" className="text-sm font-medium text-destructive-text">Attach a screenshot of your game balance to continue.</p>}
            </div>
          )}
          {waiting.length > 0 && (
            <div className="grid gap-2 rounded-lg bg-muted p-3 text-sm">
              <b className="flex items-center gap-1.5"><Clock className="size-4" aria-hidden />In progress</b>
              <ul className="grid gap-1.5">{waiting.map((r) => { const [t, l] = redeemTone(r); return (
                <li key={r.id} className="flex flex-wrap items-center gap-2"><span className="tabular-nums">{money(r.amount)}</span> from {r.game?.name}<StatusBadge tone={t}>{l}</StatusBadge></li>); })}</ul>
            </div>
          )}
        </CardContent>
      </Card>

      </div>
      <Card className="glass lg:sticky lg:top-20">
        <CardHeader><CardTitle className="text-lg"><h2>Summary</h2></CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid gap-2">
            {([["From", game?.name || "—"], ["Account", game?.login?.username || "—"], ["Send to", method ? payLabel(method) : "—"]] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2"><dt className="text-muted-foreground">{k}</dt><dd className="truncate font-semibold">{v}</dd></div>
            ))}
            <div className="flex justify-between gap-2 border-t border-dashed pt-3"><dt className="text-muted-foreground">You get</dt>
              <dd className="text-2xl font-bold text-brand-text tabular-nums">{Number(amount) ? money(amount) : "—"}</dd></div>
          </dl>
          {errors.root && <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm font-medium text-destructive-text">{errors.root.message}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || blocked} aria-busy={isSubmitting}>
            {isSubmitting ? <><Spinner aria-hidden />Sending…</> : <>Request {Number(amount) ? money(amount) : "cash out"}<ArrowRight aria-hidden /></>}
          </Button>
          <p className="text-sm text-muted-foreground">Staff redeem it from your game, send the money, then message you a receipt.</p>
        </CardContent>
      </Card>
    </form>
  );
}
