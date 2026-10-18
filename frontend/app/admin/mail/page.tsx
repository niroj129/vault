"use client";

import { Archive, ArchiveRestore, Link2, Link2Off, Mail, MailCheck, RefreshCw, Search, ShieldCheck, ShieldQuestion } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MailSetup } from "@/components/admin/mail/mail-setup";
import { matchTone } from "@/components/admin/mail/mail-evidence";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/play/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, dateTime, money } from "@/lib/format";
import { useMessengerEvents } from "@/lib/messenger";
import { payLabel } from "@/lib/pay-brands";
import type { InboundEmail } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS = [["unmatched", "No match"], ["payments", "Payments"], ["matched", "Matched"], ["other", "Other"], ["all", "All"]] as const;
type Filter = (typeof FILTERS)[number][0];
interface OpenPay { id: number; code: string; amount: number | string; username: string; player_note: string; created_at: string; method: string }
const appName = (a: string) => (a ? payLabel(a === "cashapp" ? "ecashapp" : a) : "");

function EmailSheet({ id, onClose, onChanged }: { id: number | null; onClose: () => void; onChanged: () => void }) {
  const { token } = useAuth();
  const [e, setE] = useState<InboundEmail | null>(null);
  const [pays, setPays] = useState<OpenPay[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setE(null); setPick("");
    if (!id) return;
    apiFetch<InboundEmail>(`/admin/mail/${id}/`, { token }).then((x) => { setE(x); onChanged(); }).catch((er) => toast.error(errorText(er)));
    apiFetch<OpenPay[]>("/admin/mail/open-payments/", { token }).then(setPays).catch(() => {});
  }, [id, token]); // eslint-disable-line react-hooks/exhaustive-deps -- reload the list once on open (marks it read)

  async function act(act: string, body: Record<string, unknown> = {}, done = "Saved") {
    if (!e) return;
    setBusy(act);
    try { setE(await apiFetch<InboundEmail>(`/admin/mail/${e.id}/${act}/`, { method: "POST", token, body })); toast.success(done); onChanged(); }
    catch (er) { toast.error(errorText(er)); } finally { setBusy(""); }
  }

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="pr-8">{e ? e.subject || "(no subject)" : "Email"}</SheetTitle>
          <SheetDescription>{e ? `${e.from_name ? `${e.from_name} · ` : ""}${e.from_email} · ${dateTime(e.received_at)}` : "Loading…"}</SheetDescription>
        </SheetHeader>
        {!e ? <div className="grid gap-3 px-4"><Skeleton className="h-24" /><Skeleton className="h-48" /></div> : (
          <div className="grid gap-5 px-4 pb-6">
            {e.kind === "payment" && (
              <section className="grid gap-3 rounded-lg border bg-muted/40 p-3" aria-labelledby="em-pay">
                <h3 id="em-pay" className="flex flex-wrap items-center gap-2 text-sm font-semibold">What we read
                  <StatusBadge tone={matchTone(e.match)}>{e.match_label}</StatusBadge></h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Amount</dt><dd className="text-lg font-bold tabular-nums">{money(e.amount)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">From</dt><dd className="font-semibold">{e.payer || "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">App</dt><dd>{appName(e.app) || "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Note in the email</dt><dd>{e.note ? `“${e.note}”` : "—"}</dd></div>
                </dl>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {e.verified ? <><ShieldCheck className="size-4 text-success" aria-hidden />Sender checked: really from {appName(e.app)}</>
                    : <><ShieldQuestion className="size-4 text-warning" aria-hidden />Sender not verified. Payment emails can be faked, so check your app too.</>}</p>
              </section>
            )}

            {e.kind === "payment" && (
              <section className="grid gap-3" aria-labelledby="em-link">
                <h3 id="em-link" className="text-sm font-semibold">Linked QR payment</h3>
                {e.deposit ? (
                  <div className="grid gap-2 rounded-lg border p-3 text-sm">
                    <p className="flex flex-wrap items-center justify-between gap-2"><b className="tabular-nums">{money(e.deposit.amount)} · @{e.deposit.username}</b><StatusBadge tone={e.deposit.status === "pending" ? "wait" : e.deposit.status === "approved" ? "ok" : "bad"}>{e.deposit.status_label}</StatusBadge></p>
                    <p className="text-muted-foreground">{e.deposit.method} · code <code className="font-mono">{e.deposit.code}</code>{e.deposit.player_note ? ` · name on account: ${e.deposit.player_note}` : ""}</p>
                    {Number(e.deposit.amount) !== Number(e.amount) && <p className="font-medium text-warning">Amounts differ: the email says {money(e.amount)}.</p>}
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm"><a href="/admin/deposits?tab=check">Open To check</a></Button>
                      <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act("unlink", {}, "Unlinked")}><Link2Off aria-hidden />Unlink</Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <p className="text-sm text-muted-foreground">No waiting payment matches yet. Pick the one this email pays for.</p>
                    <div className="flex flex-wrap gap-2">
                      <Select value={pick} onValueChange={setPick}>
                        <SelectTrigger className="min-w-0 flex-1" aria-label="QR payment to link"><SelectValue placeholder={pays.length ? "Choose a payment…" : "No payments waiting"} /></SelectTrigger>
                        <SelectContent>{pays.map((p) => <SelectItem key={p.id} value={String(p.id)}>{money(p.amount)} · @{p.username} · {p.method} · {p.code}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button disabled={!pick || !!busy} onClick={() => act("link", { deposit: Number(pick) }, "Linked. It shows on the payment's check card.")}><Link2 aria-hidden />Link</Button>
                      <Button variant="outline" disabled={!!busy} onClick={() => act("rematch", {}, "Checked again")}><RefreshCw aria-hidden />Match again</Button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {e.kind === "gmail_confirm" && (
              <section className="grid gap-2 rounded-lg border border-info/40 bg-info/10 p-3 text-sm">
                <p>Gmail sent this to confirm forwarding. Type this code into Gmail&apos;s Forwarding settings:</p>
                <code className="w-fit rounded bg-background px-2 py-1 font-mono text-lg font-bold">{e.confirm_code || "—"}</code>
              </section>
            )}

            <section className="grid gap-2" aria-labelledby="em-body">
              <h3 id="em-body" className="text-sm font-semibold">Message</h3>
              <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 font-sans text-sm whitespace-pre-wrap">{e.text || "(empty)"}</pre>
            </section>
            <Button variant="outline" className="w-fit" disabled={!!busy} onClick={() => act("archive", {}, e.archived ? "Moved back to the list" : "Archived")}>
              {e.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}{e.archived ? "Move back" : "Archive"}</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function PaymentEmails() {
  const { token } = useAuth();
  const [view, setView] = useState<"inbox" | "setup">("inbox");
  const [filter, setFilter] = useState<Filter>("unmatched");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ counts: Record<Filter, number>; results: InboundEmail[] } | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("id")) setOpen(Number(p.get("id")));
    if (p.get("tab") === "setup") setView("setup");
  }, []);
  const load = useCallback(() => {
    const p = new URLSearchParams({ filter, ...(q.trim() ? { q: q.trim() } : {}) });
    apiFetch<{ counts: Record<Filter, number>; results: InboundEmail[] }>(`/admin/mail/?${p}`, { token }).then(setData).catch((e) => toast.error(errorText(e)));
  }, [token, filter, q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  useMessengerEvents((ev) => { if (ev.type === "toast") load(); });
  // first visit with nothing yet: go straight to the setup steps
  const [chosen, setChosen] = useState(false);
  // first load: no emails at all → setup steps; nothing to match → show the payments instead of an empty list
  useEffect(() => {
    if (!data || chosen) return;
    setChosen(true);
    if (data.counts.all === 0) setView("setup");
    else if (filter === "unmatched" && data.counts.unmatched === 0) setFilter(data.counts.payments ? "payments" : "all");
  }, [data, chosen, filter]);

  return (
    <div className="grid gap-6">
      <PageHeader title="Payment emails" description="Payment notifications forwarded from your email. Each one is matched to a QR payment as evidence; you still approve the payment yourself." />
      <Tabs value={view} onValueChange={(v) => { setView(v as typeof view); setChosen(true); }}>
        <TabsList><TabsTrigger value="inbox" className="px-4">Emails</TabsTrigger><TabsTrigger value="setup" className="px-4">Set up forwarding</TabsTrigger></TabsList>
      </Tabs>

      {view === "setup" ? <MailSetup onSample={() => { setView("inbox"); setFilter("unmatched"); load(); }} /> : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={filter} onValueChange={(v) => { setData(null); setFilter(v as Filter); }}>
              <TabsList className="max-w-full overflow-x-auto scrollbar-none">
                {FILTERS.map(([k, l]) => (
                  <TabsTrigger key={k} value={k} className="shrink-0 px-3">{l}<span className="text-muted-foreground tabular-nums">{data?.counts[k] ?? ""}</span></TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <InputGroup className="w-full sm:w-72"><InputGroupAddon><Search aria-hidden /></InputGroupAddon>
              <InputGroupInput type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sender, name, @player" aria-label="Search emails" /></InputGroup>
          </div>

          {!data ? <Skeleton className="h-72" /> : !data.results.length ? (
            <Empty className="glass border"><EmptyHeader><EmptyMedia variant="icon"><Mail aria-hidden /></EmptyMedia>
              <EmptyTitle>{q ? `No emails match “${q}”` : filter === "unmatched" ? "Nothing waiting to be matched" : "No emails here"}</EmptyTitle>
              <EmptyDescription>{q ? "Try a different search." : "Forwarded payment emails show up here within a minute of arriving."}</EmptyDescription></EmptyHeader>
              {data.counts.all === 0 && <Button variant="outline" onClick={() => setView("setup")}>Set up forwarding</Button>}</Empty>
          ) : (
            <Card className="glass py-0">
              <ul className="divide-y">
                {data.results.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => setOpen(m.id)} className={cn("flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-accent", !m.is_read && "bg-primary/5")}>
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted" aria-hidden>{m.is_read ? <Mail className="size-4" /> : <MailCheck className="size-4 text-brand-text" />}</span>
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="flex min-w-0 items-baseline justify-between gap-2">
                          <b className="truncate">{m.kind === "payment" ? `${money(m.amount)} from ${m.payer}` : m.subject || "(no subject)"}{!m.is_read && <span className="sr-only"> (unread)</span>}</b>
                          <time className="shrink-0 text-xs text-muted-foreground">{ago(m.received_at)}</time>
                        </span>
                        <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          {m.app && <Badge variant="outline">{appName(m.app)}</Badge>}
                          {m.kind === "payment" ? <StatusBadge tone={matchTone(m.match)}>{m.match_label}{m.deposit ? ` · @${m.deposit.username}` : ""}</StatusBadge> : <Badge variant="secondary">{m.kind_label}</Badge>}
                          <span className="min-w-0 truncate">{m.kind === "payment" ? m.subject : m.preview}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
      <EmailSheet id={open} onClose={() => setOpen(null)} onChanged={load} />
    </div>
  );
}
