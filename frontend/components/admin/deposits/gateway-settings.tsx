"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { PasswordInput } from "@/components/auth/password-input";
import { CopyButton } from "@/components/common/copy-button";
import { ChoiceCards } from "@/components/play/choice-cards";
import { StatusBadge } from "@/components/play/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";

const BP_METHODS = [["ecashapp", "Cash App"], ["applepay", "Apple Pay"], ["googlepay", "Google Pay"], ["chime", "Chime"], ["venmo", "Venmo"], ["paypal", "PayPal"]] as const;
const schema = z.object({
  bp_api_key: z.string(), bp_webhook_secret: z.string(), bp_methods: z.array(z.string()),
  auto_load: z.boolean(), load_minus_fee: z.boolean(), allow_signup: z.boolean(), redeem_enabled: z.boolean(),
  load_bonus_percent: z.string().refine((v) => !v || (Number(v) >= 0 && Number(v) <= 100), "0 to 100."),
  redeem_min: z.string().refine((v) => !v || Number(v) >= 1, "At least 1."),
  redeem_methods: z.string().max(200),
  redeem_proof: z.enum(["required", "optional", "off"]),
  cashout_rule_enabled: z.boolean(),
  cashout_min_x: z.string().refine((v) => Number(v) > 0 && Number(v) <= 1000, "Enter a number above 0."),
  cashout_max_x: z.string().refine((v) => Number(v) > 0 && Number(v) <= 1000, "Enter a number above 0."),
  cashout_basis: z.enum(["loaded", "deposit"]),
}).refine((v) => Number(v.cashout_max_x) >= Number(v.cashout_min_x), { path: ["cashout_max_x"], message: "Must be at least the minimum." });
type Values = z.infer<typeof schema>;

/** BytePayout keys, which methods players see, bonus, sign-up and cash-out rules. */
export function GatewaySettings() {
  const { token } = useAuth();
  const [initial, setInitial] = useState<Values | null>(null);
  const [bal, setBal] = useState<{ ok: boolean; held?: boolean; data?: { balance: string }; detail?: string } | null>(null);
  const loadBal = () => apiFetch<typeof bal>("/admin/gateway-balance/", { token }).then(setBal).catch(() => {});
  useEffect(() => {
    apiFetch<Record<string, unknown>>("/settings/", { token }).then((s) => setInitial({
      bp_api_key: String(s.bp_api_key || ""), bp_webhook_secret: String(s.bp_webhook_secret || ""),
      bp_methods: String(s.bp_methods || "").split(",").map((x) => x.trim()).filter(Boolean),
      auto_load: !!s.auto_load, load_minus_fee: !!s.load_minus_fee, allow_signup: !!s.allow_signup, redeem_enabled: !!s.redeem_enabled,
      load_bonus_percent: String(s.load_bonus_percent ?? "0"), redeem_min: String(s.redeem_min ?? "20"), redeem_methods: String(s.redeem_methods || ""),
      redeem_proof: s.redeem_proof === "required" || s.redeem_proof === "off" ? s.redeem_proof : "optional",
      cashout_rule_enabled: s.cashout_rule_enabled !== false, cashout_min_x: String(Number(s.cashout_min_x ?? 3)), cashout_max_x: String(Number(s.cashout_max_x ?? 10)),
      cashout_basis: s.cashout_basis === "deposit" ? "deposit" : "loaded",
    })).catch((e) => toast.error(errorText(e)));
    void loadBal();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps -- load once
  if (!initial) return <Skeleton className="h-96 rounded-xl" />;
  return <SettingsForm initial={initial} bal={bal} onSaved={loadBal} />;
}

function SettingsForm({ initial, bal, onSaved }: { initial: Values; bal: { ok: boolean; held?: boolean; data?: { balance: string }; detail?: string } | null; onSaved: () => void }) {
  const { token } = useAuth();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  const hook = typeof window !== "undefined" ? `${window.location.origin}/api/pay/bytepayout/webhook/` : "";
  const { errors, isSubmitting, isDirty } = form.formState;
  async function save(v: Values) {
    try {
      await apiFetch("/settings/", { method: "PUT", token, body: { ...v, bp_methods: v.bp_methods.join(",") } });
      toast.success("Payment settings saved"); form.reset(v); onSaved();
    } catch (e) { form.setError("root", { message: errorText(e) }); }
  }
  const [ruleOn, lo, hi, basis, siteMin] = form.watch(["cashout_rule_enabled", "cashout_min_x", "cashout_max_x", "cashout_basis", "redeem_min"]);
  const example = (n: number) => `${money(Math.max(n * Number(lo || 0), Number(siteMin || 0)))} – ${money(n * Number(hi || 0))}`;
  const toggle = (name: "auto_load" | "load_minus_fee" | "allow_signup" | "redeem_enabled" | "cashout_rule_enabled", label: string, help: string) => (
    <Controller control={form.control} name={name} render={({ field }) => (
      <Field orientation="horizontal" className="justify-between rounded-lg border p-3">
        <FieldContent><FieldLabel htmlFor={`gs-${name}`}>{label}</FieldLabel><FieldDescription>{help}</FieldDescription></FieldContent>
        <Switch id={`gs-${name}`} checked={field.value} onCheckedChange={field.onChange} />
      </Field>
    )} />
  );
  return (
    <form noValidate onSubmit={form.handleSubmit(save)} className="grid gap-4">
      <Card className="glass">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div className="grid gap-1"><CardTitle className="text-lg"><h2>BytePayout</h2></CardTitle><CardDescription>Card and app payments (except methods you set up as your own QR).</CardDescription></div>
          {bal && (bal.ok ? <StatusBadge tone="ok">{bal.held ? "Held for you" : "Balance"} {money(bal.data?.balance)}</StatusBadge> : <StatusBadge tone="wait">{bal.detail || "Not connected"}</StatusBadge>)}
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="gs-key">API key</FieldLabel><PasswordInput id="gs-key" autoComplete="off" placeholder="bp_live_…" {...form.register("bp_api_key")} /></Field>
            <Field><FieldLabel htmlFor="gs-secret">Webhook signing key</FieldLabel><PasswordInput id="gs-secret" autoComplete="off" {...form.register("bp_webhook_secret")} /></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor="gs-hook">Webhook address — paste this into BytePayout</FieldLabel>
              <div className="flex gap-2"><Input id="gs-hook" readOnly value={hook} onFocus={(e) => e.currentTarget.select()} /><CopyButton value={hook} label="webhook address" size="icon" /></div></Field>
            <Controller control={form.control} name="bp_methods" render={({ field }) => (
              <FieldSet className="sm:col-span-2"><FieldLegend variant="label">Methods players can use</FieldLegend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {BP_METHODS.map(([k, l]) => (
                    <Field key={k} orientation="horizontal" className="min-h-10"><Checkbox id={`gs-m-${k}`} checked={field.value.includes(k)}
                      onCheckedChange={(c) => field.onChange(c ? [...field.value, k] : field.value.filter((x) => x !== k))} />
                      <FieldLabel htmlFor={`gs-m-${k}`} className="font-normal">{l}</FieldLabel></Field>
                  ))}
                </div></FieldSet>
            )} />
          </FieldGroup>
        </CardContent>
      </Card>
      <Card className="glass">
        <CardHeader><CardTitle className="text-lg"><h2>Loading, sign-up &amp; cash outs</h2></CardTitle></CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            {toggle("auto_load", "Load games automatically", "Only for games connected to a game API.")}
            {toggle("load_minus_fee", "Load the amount minus the gateway fee", "Otherwise you absorb the fee.")}
            {toggle("allow_signup", "Players can sign up themselves", "Shows Create account on the site.")}
            {toggle("redeem_enabled", "Players can request cash outs", "From Load & cash out → Cash out.")}
            <Field data-invalid={!!errors.load_bonus_percent}><FieldLabel htmlFor="gs-bonus">Bonus on every deposit (%)</FieldLabel>
              <Input id="gs-bonus" type="number" inputMode="decimal" min="0" max="100" step="0.5" aria-invalid={!!errors.load_bonus_percent} {...form.register("load_bonus_percent")} />
              <FieldError>{errors.load_bonus_percent?.message}</FieldError></Field>
            <Field data-invalid={!!errors.redeem_min}><FieldLabel htmlFor="gs-min">Minimum cash out ($)</FieldLabel>
              <Input id="gs-min" type="number" inputMode="numeric" min="1" aria-invalid={!!errors.redeem_min} {...form.register("redeem_min")} /><FieldError>{errors.redeem_min?.message}</FieldError></Field>
            <Controller control={form.control} name="redeem_proof" render={({ field }) => (
              <Field className="sm:col-span-2"><FieldLabel htmlFor="gs-proof">Screenshot with a cash-out request</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="gs-proof" className="w-full sm:w-72"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="optional">Optional</SelectItem><SelectItem value="required">Required</SelectItem><SelectItem value="off">Don&apos;t ask</SelectItem></SelectContent></Select>
                <FieldDescription>Players attach a screenshot of their game balance. Staff see it on the cash-out card. Staff can still attach a receipt when they mark it paid.</FieldDescription></Field>
            )} />
            <Field className="sm:col-span-2"><FieldLabel htmlFor="gs-rm">Cash-out methods</FieldLabel><Input id="gs-rm" {...form.register("redeem_methods")} />
              <FieldDescription>Comma separated, e.g. cashapp, chime, venmo, paypal, zelle</FieldDescription></Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card className="glass">
        <CardHeader><CardTitle className="text-lg"><h2>Cash-out rule</h2></CardTitle>
          <CardDescription>Each cash out must be between a minimum and maximum multiple of the player&apos;s last load on that game. One cash out per load; a declined cash out frees the load again.</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{toggle("cashout_rule_enabled", "Use the cash-out rule", "Off: players can cash out any amount above the minimum.")}</div>
            <Field data-invalid={!!errors.cashout_min_x}><FieldLabel htmlFor="gs-minx">Minimum (× the load)</FieldLabel>
              <Input id="gs-minx" type="number" inputMode="decimal" min="0.1" step="0.5" disabled={!ruleOn} aria-invalid={!!errors.cashout_min_x} {...form.register("cashout_min_x")} />
              <FieldError>{errors.cashout_min_x?.message}</FieldError></Field>
            <Field data-invalid={!!errors.cashout_max_x}><FieldLabel htmlFor="gs-maxx">Maximum (× the load)</FieldLabel>
              <Input id="gs-maxx" type="number" inputMode="decimal" min="0.1" step="0.5" disabled={!ruleOn} aria-invalid={!!errors.cashout_max_x} {...form.register("cashout_max_x")} />
              <FieldError>{errors.cashout_max_x?.message}</FieldError></Field>
            <Controller control={form.control} name="cashout_basis" render={({ field }) => (
              <FieldSet className="sm:col-span-2" disabled={!ruleOn}><FieldLegend variant="label">Multiply</FieldLegend>
                <ChoiceCards label="Multiply" value={field.value} onChange={field.onChange} className="sm:grid-cols-2" choices={[
                  { value: "loaded", label: "Credits loaded", description: "What staff typed in when they marked it Loaded (includes any bonus)." },
                  { value: "deposit", label: "Money paid", description: "What the player actually sent you." },
                ]} />
              </FieldSet>
            )} />
            {ruleOn && Number(lo) > 0 && Number(hi) >= Number(lo) && (
              <p className="rounded-lg bg-muted p-3 text-sm sm:col-span-2" aria-live="polite">
                Example: a player who {basis === "deposit" ? "paid" : "got loaded"} <b>$20</b> can cash out <b className="tabular-nums">{example(20)}</b>; <b>$50</b> → <b className="tabular-nums">{example(50)}</b>.
                The minimum cash out above (${siteMin || 0}) still applies.
              </p>
            )}
          </FieldGroup>
        </CardContent>
      </Card>
      {errors.root && <p role="alert" className="text-sm text-destructive-text">{errors.root.message}</p>}
      <Button type="submit" className="w-fit" disabled={isSubmitting || !isDirty} aria-busy={isSubmitting}>{isSubmitting ? "Saving…" : "Save payment settings"}</Button>
    </form>
  );
}
