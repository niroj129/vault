"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Hourglass, Landmark, Percent, SendHorizontal, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { StatCard } from "@/components/admin/stat-card";
import { PasswordInput } from "@/components/auth/password-input";
import { CopyButton } from "@/components/common/copy-button";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge, depositTone, type Tone } from "@/components/play/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, money } from "@/lib/format";
import type { DepositStatus, LoadStatus } from "@/lib/types";

type Money = number | string;
type Account = "own" | "owner" | "none";
interface Data {
  days: number;
  account: { configured: boolean; webhook_secret_set: boolean; base_url: string; balance: { balance: Money; currency: string } | null; error: string; webhook_url: string; sites_using: number; owed_total: Money };
  totals: { paid: Money; fees: Money; paid_count: number; waiting: number; failed: number };
  sites: { id: number; name: string; is_platform: boolean; is_active: boolean; account: Account; use_owner: boolean; owed: Money | null; paid_out: Money | null; paid: Money; paid_count: number; fees: Money; waiting: number; failed: number }[];
  methods: { label: string; amount: Money; count: number }[];
  recent: { id: number; at: string; site: string; username: string; game: string; amount: Money; fee: Money; method: string; status: DepositStatus; status_label: string; load_status: LoadStatus; load_label: string; account: Account }[];
}
const PERIODS = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last 12 months"]] as const;
const ACCOUNT: Record<Account, [Tone, string]> = { owner: ["ok", "Your account"], own: ["neutral", "Its own key"], none: ["wait", "Not set up"] };

const keySchema = z.object({ bp_api_key: z.string().trim(), bp_webhook_secret: z.string().trim() });
type KeyValues = z.infer<typeof keySchema>;

function KeyForm({ onSaved }: { onSaved: () => void }) {
  const { token } = useAuth();
  const [initial, setInitial] = useState<KeyValues | null>(null);
  const form = useForm<KeyValues>({ resolver: zodResolver(keySchema), defaultValues: { bp_api_key: "", bp_webhook_secret: "" } });
  useEffect(() => {
    apiFetch<Record<string, unknown>>("/settings/", { token }).then((s) => {
      const v = { bp_api_key: String(s.bp_api_key || ""), bp_webhook_secret: String(s.bp_webhook_secret || "") };
      setInitial(v); form.reset(v);
    }).catch(() => {});
  }, [token, form]);
  const { isSubmitting, isDirty, errors } = form.formState;
  async function save(v: KeyValues) {
    try { await apiFetch("/settings/", { method: "PUT", token, body: v }); toast.success("Saved your BytePayout keys"); form.reset(v); onSaved(); }
    catch (e) { form.setError("root", { message: errorText(e) }); }
  }
  if (!initial) return <Skeleton className="h-32" />;
  return (
    <form noValidate onSubmit={form.handleSubmit(save)}>
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field><FieldLabel htmlFor="bp-key">API key</FieldLabel><PasswordInput id="bp-key" autoComplete="off" placeholder="bp_live_…" {...form.register("bp_api_key")} /></Field>
        <Field><FieldLabel htmlFor="bp-secret">Webhook signing key</FieldLabel><PasswordInput id="bp-secret" autoComplete="off" {...form.register("bp_webhook_secret")} />
          <FieldDescription>Every payment notice is checked against this key.</FieldDescription></Field>
        {errors.root && <p role="alert" className="text-sm text-destructive-text sm:col-span-2">{errors.root.message}</p>}
        <div className="sm:col-span-2"><Button type="submit" disabled={isSubmitting || !isDirty} aria-busy={isSubmitting}>{isSubmitting && <Spinner />}{isSubmitting ? "Saving…" : "Save keys"}</Button></div>
      </FieldGroup>
    </form>
  );
}

function PayoutDialog({ site, onClose, onDone }: { site: Data["sites"][number] | null; onClose: () => void; onDone: () => void }) {
  const { token } = useAuth();
  const owed = Number(site?.owed || 0);
  const schema = z.object({
    amount: z.string().refine((v) => Number(v) > 0, "Enter the amount you paid out.").refine((v) => Number(v) <= owed + 0.0001, `${site?.name} is only owed ${money(owed)}.`),
    note: z.string().trim().max(200),
  });
  const form = useForm<{ amount: string; note: string }>({ resolver: zodResolver(schema), defaultValues: { amount: "", note: "" } });
  useEffect(() => { form.reset({ amount: owed ? String(owed) : "", note: "" }); }, [site]); // eslint-disable-line react-hooks/exhaustive-deps -- reset when a different site opens
  const { errors, isSubmitting } = form.formState;
  async function save(v: { amount: string; note: string }) {
    try { await apiFetch("/platform/bytepayout/payouts/", { method: "POST", token, body: { site: site?.id, ...v } }); toast.success(`Recorded ${money(v.amount)} paid out to ${site?.name}`); onDone(); }
    catch (e) { form.setError("root", { message: errorText(e) }); }
  }
  return (
    <Dialog open={!!site} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form noValidate onSubmit={form.handleSubmit(save)} className="grid gap-5">
          <DialogHeader><DialogTitle>Record a payout to {site?.name}</DialogTitle>
            <DialogDescription>Do this after you&apos;ve sent them the money (bank, Cash App, anything). It lowers what you hold for them and tells their admins. This page never moves money itself.</DialogDescription></DialogHeader>
          <p className="rounded-md bg-muted p-3 text-sm">You hold <b className="tabular-nums">{money(owed)}</b> for {site?.name}.</p>
          <Field data-invalid={!!errors.amount}><FieldLabel htmlFor="po-amount">Amount you paid out</FieldLabel>
            <InputGroup><InputGroupAddon><InputGroupText>$</InputGroupText></InputGroupAddon>
              <InputGroupInput id="po-amount" type="number" inputMode="decimal" min="0" step="0.01" className="tabular-nums" aria-invalid={!!errors.amount} {...form.register("amount")} /></InputGroup>
            <FieldError>{errors.amount?.message}</FieldError></Field>
          <Field><FieldLabel htmlFor="po-note">Note <span className="font-normal text-muted-foreground">(optional, they see it)</span></FieldLabel>
            <Input id="po-note" maxLength={200} placeholder="e.g. Sent by Cash App, Oct 18" {...form.register("note")} /></Field>
          {errors.root && <p role="alert" className="text-sm text-destructive-text">{errors.root.message}</p>}
          <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>{isSubmitting && <Spinner />}{isSubmitting ? "Saving…" : "Record payout"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function OwnerBytePayout() {
  const { token } = useAuth();
  const [days, setDays] = useState("30");
  const [d, setD] = useState<Data | null>(null);
  const [paying, setPaying] = useState<Data["sites"][number] | null>(null);
  const load = useCallback(() => {
    apiFetch<Data>(`/platform/bytepayout/?days=${days}`, { token }).then(setD).catch((e) => toast.error(errorText(e)));
  }, [token, days]);
  useEffect(() => { setD(null); load(); }, [load]);
  const a = d?.account;

  return (
    <div className="grid gap-6">
      <PageHeader title="BytePayout" description="Your BytePayout merchant account and every card or app payment that went through it, across all sites."
        actions={<Select value={days} onValueChange={setDays}><SelectTrigger className="w-44" aria-label="Period"><SelectValue /></SelectTrigger>
          <SelectContent>{PERIODS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>} />
      {!d || !a ? <div className="grid gap-4"><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-64" /></div> : <>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard icon={Landmark} label="Account balance" value={a.balance ? money(a.balance.balance) : a.configured ? "Can't read" : "Not connected"}
            note={a.balance ? `${a.balance.currency} · live from BytePayout` : a.error || "Add your keys below"} tone={!a.balance ? "warn" : undefined} />
          <StatCard icon={TrendingUp} label="Paid through BytePayout" value={money(d.totals.paid)} note={`${d.totals.paid_count} payment${d.totals.paid_count === 1 ? "" : "s"}`} />
          <StatCard icon={Percent} label="Fees" value={money(d.totals.fees)} note="Taken by BytePayout" />
          <StatCard icon={Hourglass} label="Waiting / failed" value={`${d.totals.waiting} / ${d.totals.failed}`} note="Unpaid, expired or refused" tone={d.totals.failed ? "warn" : undefined} />
          <StatCard icon={SendHorizontal} label="You hold for sites" value={money(a.owed_total)} note="To pay out to site owners" tone={Number(a.owed_total) > 0 ? "warn" : undefined} />
        </div>

        <Card className="glass">
          <CardHeader><CardTitle className="text-lg"><h2>Your merchant account</h2></CardTitle>
            <CardDescription className="max-w-prose">Sites switched to your account (Client sites → Edit) send their card and app payments here. Payment notices from BytePayout go to one address for all sites, and the site is found from each payment.</CardDescription></CardHeader>
          <CardContent className="grid gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={a.configured ? "ok" : "wait"}>{a.configured ? "API key saved" : "No API key"}</StatusBadge>
              <StatusBadge tone={a.webhook_secret_set ? "ok" : "wait"}>{a.webhook_secret_set ? "Webhook key saved" : "No webhook key"}</StatusBadge>
              <Badge variant="outline">{a.sites_using} site{a.sites_using === 1 ? "" : "s"} using your account</Badge>
            </div>
            {a.error && <p role="alert" className="flex items-center gap-2 text-sm text-destructive-text"><CircleAlert className="size-4" aria-hidden />{a.error}</p>}
            <Field><FieldLabel htmlFor="bp-hook">Webhook address: paste this into BytePayout</FieldLabel>
              <div className="flex gap-2"><Input id="bp-hook" readOnly value={a.webhook_url} className="font-mono text-sm" onFocus={(e) => e.currentTarget.select()} /><CopyButton value={a.webhook_url} label="webhook address" size="icon" /></div></Field>
            <KeyForm onSaved={load} />
          </CardContent>
        </Card>

        <Card className="glass gap-0 py-0">
          <CardHeader className="py-4"><CardTitle className="text-lg"><h2>Which sites use which account</h2></CardTitle></CardHeader>
          <Table>
            <TableHeader><TableRow><TableHead>Site</TableHead><TableHead>Takes payments through</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Fees</TableHead><TableHead className="text-right">You hold for it</TableHead><TableHead className="text-right">Waiting</TableHead><TableHead><span className="sr-only">Payout</span></TableHead></TableRow></TableHeader>
            <TableBody>{d.sites.map((s) => { const [tone, label] = ACCOUNT[s.account]; return (
              <TableRow key={s.id}>
                <TableCell><b>{s.name}</b>{s.is_platform && <Badge variant="secondary" className="ml-2">Yours</Badge>}</TableCell>
                <TableCell><StatusBadge tone={tone}>{label}</StatusBadge></TableCell>
                <TableCell className="text-right tabular-nums">{money(s.paid)}<div className="text-xs text-muted-foreground">{s.paid_count} payments</div></TableCell>
                <TableCell className="text-right tabular-nums">{money(s.fees)}</TableCell>
                <TableCell className="text-right tabular-nums">{s.owed == null ? "—" : <b>{money(s.owed)}</b>}{s.paid_out ? <div className="text-xs text-muted-foreground">{money(s.paid_out)} paid out</div> : null}</TableCell>
                <TableCell className="text-right tabular-nums">{s.waiting}</TableCell>
                <TableCell className="text-right">{s.owed != null && Number(s.owed) > 0 && <Button size="sm" variant="outline" onClick={() => setPaying(s)}>Record payout<span className="sr-only"> to {s.name}</span></Button>}</TableCell>
              </TableRow>); })}</TableBody>
          </Table>
        </Card>

        <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.6fr]">
          <Card className="glass gap-0 py-0">
            <CardHeader className="py-4"><CardTitle className="text-lg"><h2>By method</h2></CardTitle></CardHeader>
            <Table><TableHeader><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Payments</TableHead><TableHead className="text-right">Paid</TableHead></TableRow></TableHeader>
              <TableBody>{d.methods.map((m) => <TableRow key={m.label}><TableCell><b>{m.label}</b></TableCell><TableCell className="text-right tabular-nums">{m.count}</TableCell><TableCell className="text-right font-semibold tabular-nums">{money(m.amount)}</TableCell></TableRow>)}
                {!d.methods.length && <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">No paid payments in this period.</TableCell></TableRow>}</TableBody></Table>
          </Card>
          <Card className="glass gap-0 py-0">
            <CardHeader className="py-4"><CardTitle className="text-lg"><h2>Latest BytePayout payments</h2></CardTitle></CardHeader>
            <Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Site</TableHead><TableHead>Player</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{d.recent.map((r) => { const [tone, label] = depositTone(r); return (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{ago(r.at)}</TableCell><TableCell>{r.site}</TableCell><TableCell><b>@{r.username}</b></TableCell><TableCell>{r.method}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{money(r.amount)}<div className="text-xs font-normal text-muted-foreground">fee {money(r.fee)}</div></TableCell>
                  <TableCell><StatusBadge tone={tone}>{label}</StatusBadge></TableCell>
                </TableRow>); })}
                {!d.recent.length && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No BytePayout payments yet.</TableCell></TableRow>}</TableBody></Table>
          </Card>
        </div>
      </>}
      <PayoutDialog site={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); }} />
    </div>
  );
}
