"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Check, Gamepad2, Gift, QrCode, Tag, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import { payDot } from "@/lib/pay-brands";
import type { Deposit, DirectMethod, PlayOptions, PromoQuote } from "@/lib/types";
import { ChoiceCards } from "./choice-cards";
import { DirectPayDialog } from "./direct-pay-dialog";

interface MethodOption { key: string; label: string; amounts: number[]; direct?: DirectMethod }

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <CardTitle className="flex items-center gap-2 text-lg">
      <span className="grid size-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground" aria-hidden>{n}</span>
      <h2>{children}</h2>
    </CardTitle>
  );
}

export function LoadForm({ opts, preselect, initialPromo = "", onStarted }: { opts: PlayOptions; preselect: number | null; initialPromo?: string; onStarted: (ref: string) => void }) {
  const { token } = useAuth();
  const games = useMemo(() => [...opts.games].sort((a, b) => Number(!!b.login) - Number(!!a.login)), [opts.games]);
  const methods: MethodOption[] = useMemo(() => [
    ...opts.direct_methods.map((d) => ({ key: `d${d.id}`, label: d.name, amounts: d.amounts, direct: d })),
    ...opts.methods,
  ], [opts]);
  const [sheet, setSheet] = useState(false);

  const schema = z.object({
    game: z.string().min(1, "Choose a game."),
    method: z.string().min(1, "Choose how you'll pay."),
    amount: z.string().min(1, "Choose an amount."),
    game_username: z.string().trim().max(120).optional(),
  }).superRefine((v, ctx) => {
    const m = methods.find((x) => x.key === v.method);
    const n = Number(v.amount);
    if (m?.direct && v.amount && (!(n > 0) || n < Number(m.direct.min) || n > Number(m.direct.max))) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: `${m.label} payments are ${money(m.direct.min)}–${money(m.direct.max)}.` });
    }
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), mode: "onChange",
    defaultValues: { game: String(preselect && games.some((g) => g.id === preselect) ? preselect : games[0]?.id ?? ""), method: methods[0]?.key ?? "", amount: "", game_username: "" } });
  const { errors, isSubmitting } = form.formState;
  const [gameId, methodKey, amount, gameUser] = form.watch(["game", "method", "amount", "game_username"]);
  const game = games.find((g) => String(g.id) === gameId);
  const m = methods.find((x) => x.key === methodKey);
  useEffect(() => { form.setValue("amount", ""); }, [methodKey, form]);
  // promo code: typed text, the code being applied, and what the server says it's worth for this amount
  const [promoText, setPromoText] = useState(initialPromo.toUpperCase());
  const [promoCode, setPromoCode] = useState(initialPromo.toUpperCase());
  const [quote, setQuote] = useState<PromoQuote | null>(null);
  const [promoError, setPromoError] = useState("");
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    setQuote(null); setPromoError("");
    if (!(Number(amount) > 0)) return;
    let live = true;
    setChecking(true);
    // with no code typed this asks for the automatic promotion the player qualifies for, if any
    apiFetch<PromoQuote>("/play/promo/check/", { method: "POST", token, body: { code: promoCode, amount } })
      .then((q) => { if (live && q.valid) setQuote(q); })
      .catch((e) => { if (live && promoCode) setPromoError(errorText(e)); })
      .finally(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, [promoCode, amount, token]);
  const credits = quote ? Number(quote.credits) : Number(amount) ? Number(amount) * (1 + Number(opts.bonus_percent || 0) / 100) : 0;
  const applyPromo = () => setPromoCode(promoText.trim().toUpperCase());
  const clearPromo = () => { setPromoCode(""); setPromoText(""); };

  async function submit(v: Values) {
    if (promoCode && !quote) { form.setError("root", { message: promoError || "Wait for the promo code to be checked, or remove it." }); return; }
    if (m?.direct) { setSheet(true); return; }
    try {
      const d = await apiFetch<Deposit>("/play/deposits/", { method: "POST", token, body: {
        game: Number(v.game), method: v.method, amount: v.amount, game_username: v.game_username?.trim(),
        promo_code: quote && !quote.auto ? promoCode : undefined, return_url: `${window.location.origin}/load` } });
      if (d.checkout_url) {
        // straight to the hosted checkout (even when a tag is shown too); flag it so the status page doesn't send them again on return
        try { sessionStorage.setItem(`pay-redirected:${d.reference}`, "1"); } catch { /* private mode */ }
        window.location.href = d.checkout_url; return;
      }
      onStarted(d.reference);
    } catch (e) { form.setError("root", { message: errorText(e) }); }
  }

  if (!games.length) {
    return <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Gamepad2 aria-hidden /></EmptyMedia><EmptyTitle>No games to load yet</EmptyTitle>
      <EmptyDescription>Games appear here once staff add them.</EmptyDescription></EmptyHeader></Empty>;
  }

  return (
    <>
    <form onSubmit={form.handleSubmit(submit)} noValidate className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid gap-4">
      <Card className="glass">
        <CardHeader><StepTitle n={1}>Choose a game</StepTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Controller control={form.control} name="game" render={({ field }) => (
            <ChoiceCards label="Game" value={field.value} onChange={field.onChange} className="sm:grid-cols-2 xl:grid-cols-3"
              choices={games.map((g) => ({
                value: String(g.id), label: g.name,
                description: g.login ? g.login.username : g.automated ? "Account made for you" : "Add your username",
                media: (
                  <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                    {g.thumbnail ? <Image src={mediaUrl(g.logo || g.thumbnail)} alt="" fill sizes="44px" className="object-cover" /> : <Gamepad2 className="size-5" aria-hidden />}
                  </span>),
              }))} />
          )} />
          <FieldError>{errors.game?.message}</FieldError>
          {game && !game.login && !game.automated && (
            <Field data-invalid={!!errors.game_username}>
              <FieldLabel htmlFor="game-username">Your {game.name} username <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
              <Input id="game-username" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={120} placeholder="e.g. maya_77" {...form.register("game_username")} />
              <FieldDescription>Don&apos;t have one yet? Leave it blank — we&apos;ll create it and send you the login in chat.</FieldDescription>
            </Field>
          )}
          {game?.login && <p className="text-sm text-muted-foreground">We&apos;ll load <b className="text-foreground">{game.login.username}</b> on {game.name}.</p>}
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader><StepTitle n={2}>Pay with</StepTitle></CardHeader>
        <CardContent className="grid gap-6">
          <Controller control={form.control} name="method" render={({ field }) => (
            <ChoiceCards label="Payment method" value={field.value} onChange={field.onChange} className="grid-cols-1 xs:grid-cols-2 md:grid-cols-3"
              choices={methods.map((x) => ({
                value: x.key, label: x.label,
                media: <span className="size-3.5 shrink-0 rounded-sm ring-1 ring-foreground/20" style={{ background: payDot(x.direct ? x.direct.key : x.key) }} aria-hidden />,
                aside: x.direct ? <Badge variant="secondary" className="gap-1"><QrCode className="size-3" aria-hidden />QR</Badge> : undefined,
              }))} />
          )} />
          <FieldError>{errors.method?.message}</FieldError>

          <div className="grid gap-3">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground" aria-hidden>3</span>
              <h2 className="text-lg font-semibold" id="amount-title">Amount</h2>
              {Number(opts.bonus_percent) > 0 && <Badge className="ml-auto bg-success text-background">+{Number(opts.bonus_percent)}% bonus</Badge>}
            </div>
            <Controller control={form.control} name="amount" render={({ field }) => (
              <>
                {!!m?.amounts.length && (
                  <ChoiceCards label="Amount" value={m.amounts.map(String).includes(field.value) ? field.value : undefined} onChange={field.onChange} variant="chip"
                    className="grid-cols-3 sm:grid-cols-6" choices={m.amounts.map((a) => ({ value: String(a), label: <span className="tabular-nums">{money(a)}</span> }))} />
                )}
                {m?.direct && (
                  <Field data-invalid={!!errors.amount}>
                    <FieldLabel htmlFor="custom-amount">Or enter an amount</FieldLabel>
                    <InputGroup>
                      <InputGroupAddon><InputGroupText>$</InputGroupText></InputGroupAddon>
                      <InputGroupInput id="custom-amount" type="number" inputMode="decimal" min={Number(m.direct.min)} max={Number(m.direct.max)} step="0.01"
                        value={m.amounts.map(String).includes(field.value) ? "" : field.value} onChange={(e) => field.onChange(e.target.value)}
                        placeholder={`${Number(m.direct.min)}–${Number(m.direct.max)}`} aria-invalid={!!errors.amount} className="tabular-nums" />
                    </InputGroup>
                  </Field>
                )}
              </>
            )} />
            <FieldError>{errors.amount?.message}</FieldError>
          </div>
        </CardContent>
      </Card>

      </div>
      <Card className="glass lg:sticky lg:top-20">
        <CardHeader><CardTitle className="text-lg"><h2>Summary</h2></CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Field data-invalid={!!promoError}>
            <FieldLabel htmlFor="promo-code" className="gap-1.5"><Tag className="size-4" aria-hidden />Promo code <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
            {quote?.auto && (
              <p className="flex items-start gap-2 rounded-md bg-success/15 px-3 py-2 text-sm" role="status">
                <Gift className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /><span><b>{quote.title}</b> — +{money(quote.bonus)} added automatically</span>
              </p>
            )}
            {promoCode && quote ? (
              <div className="flex items-center gap-2 rounded-md bg-success/15 py-1.5 pr-1 pl-3" role="status">
                <Check className="size-4 shrink-0 text-success" aria-hidden />
                <span className="min-w-0 flex-1"><b className="font-mono">{quote.code}</b><span className="block text-sm text-muted-foreground">+{money(quote.bonus)} bonus credits</span></span>
                <Button type="button" variant="ghost" size="icon" onClick={clearPromo} aria-label={`Remove code ${quote.code}`}><X aria-hidden /></Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input id="promo-code" value={promoText} onChange={(e) => setPromoText(e.target.value.toUpperCase())} maxLength={40}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyPromo(); } }}
                  autoComplete="off" autoCapitalize="characters" spellCheck={false} className="font-mono uppercase" aria-invalid={!!promoError} aria-describedby="promo-help" />
                <Button type="button" variant="outline" onClick={applyPromo} disabled={!promoText.trim() || checking} aria-busy={checking}>{checking ? <Spinner aria-hidden /> : "Apply"}</Button>
              </div>
            )}
            {!(promoCode && quote) && !quote?.auto && (
              <FieldDescription id="promo-help" role={promoError ? "alert" : undefined} className={promoError ? "text-destructive-text" : undefined}>
                {promoError || (promoCode && !Number(amount) ? "Pick an amount to see your bonus." : "Enter a code to get bonus credits on this load.")}
              </FieldDescription>
            )}
          </Field>
          <dl className="grid gap-2">
            {([["Game", game?.name || "—"], ["Pay with", m?.label || "—"], ["You pay", Number(amount) ? money(amount) : "—"]] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2"><dt className="text-muted-foreground">{k}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>
            ))}
            {quote && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{quote.auto ? quote.title : `Promo ${quote.code}`}</dt><dd className="font-semibold text-success tabular-nums">+{money(quote.bonus)}</dd></div>}
            <div className="flex justify-between gap-2 border-t border-dashed pt-3"><dt className="text-muted-foreground">Credits</dt>
              <dd className="text-2xl font-bold text-brand-text tabular-nums">{credits ? money(credits.toFixed(2)) : "—"}</dd></div>
          </dl>
          {errors.root && <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm font-medium text-destructive-text">{errors.root.message}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? <><Spinner aria-hidden />Starting…</> : m?.direct ? <>Show {m.label} QR<ArrowRight aria-hidden /></> : <>Pay {Number(amount) ? money(amount) : ""}<ArrowRight aria-hidden /></>}
          </Button>
          <p className="text-sm text-muted-foreground">{m?.direct
            ? `Send it to our ${m.label}, upload the screenshot and tap “I've paid” — staff check it and load your game.`
            : game?.automated && opts.auto_load ? "Credits load automatically the moment your payment clears."
            : "As soon as your payment clears, our team loads your game — you'll get a message in Support when it's done."}</p>
        </CardContent>
      </Card>
    </form>
    {/* outside the <form>: React bubbles portal events to parents, so a nested form would also submit this one */}
    {m?.direct && game && (
      <DirectPayDialog open={sheet} onOpenChange={setSheet} method={m.direct} amount={amount} game={game} gameUser={(gameUser || "").trim()} promoCode={quote && !quote.auto ? promoCode : ""} onSent={onStarted} />
    )}
    </>
  );
}
