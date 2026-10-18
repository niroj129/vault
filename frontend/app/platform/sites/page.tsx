"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { FEATURES, PLANS, SiteForm, type SiteValues } from "@/components/platform/site-form";
import { StatusBadge } from "@/components/play/status-badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";

interface Tenant extends Record<string, unknown> { id: number; name: string; slug: string; domains: string[]; plan: string; monthly_price: string; max_users: number;
  paid_until: string | null; owner_email: string; notes: string; is_active: boolean; is_platform: boolean; user_count: number }
interface Usage { id: number; name: string; is_active: boolean; players: number; active_players: number; messages: number; loads: number; last_activity: string | null }

const BLANK: SiteValues = { name: "", slug: "", domains: "", plan: "pro", monthly_price: "199", paid_until: "", max_users: "0", owner_email: "", notes: "",
  feature_games: true, feature_messenger: true, feature_sms: false, feature_payments: true, use_owner_bytepayout: true, admin_username: "admin", admin_password: "", color_accent: "#7C3AED", seed_demo: true };
const siteLink = (host: string) => (typeof window === "undefined" ? `https://${host}` : `${window.location.protocol}//${host}${window.location.port === "3000" ? ":3000" : ""}`);

export default function SitesPage() {
  const { user, token, ready } = useAuth();
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [stats, setStats] = useState<{ tenants: number; active: number; mrr: number; users: number } | null>(null);
  const [usage, setUsage] = useState<Usage[] | null>(null);
  const [editing, setEditing] = useState<Tenant | "new" | null>(null);
  const [deleting, setDeleting] = useState<Tenant | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiFetch<Tenant[]>("/platform/tenants/", { token }).then(setTenants).catch((e) => toast.error(errorText(e)));
    apiFetch<typeof stats>("/platform/stats/", { token }).then(setStats).catch(() => {});
    apiFetch<Usage[]>("/platform/usage/", { token }).then(setUsage).catch(() => setUsage([]));
  }, [token]);
  useEffect(() => { if (token && user?.is_platform_owner) load(); }, [token, user, load]);
  if (!ready || !user?.is_platform_owner) return <div role="status" className="flex min-h-[40dvh] items-center justify-center gap-3 text-muted-foreground"><Spinner aria-hidden />Loading…</div>;

  async function save(v: SiteValues): Promise<string | void> {
    const body: Record<string, unknown> = { ...v, domains: v.domains.split(/[\s,]+/).filter(Boolean), paid_until: v.paid_until || null, max_users: Number(v.max_users) || 0 };
    try {
      if (editing && editing !== "new") {
        ["admin_password", "admin_username", "seed_demo", "color_accent"].forEach((k) => delete body[k]);
        await apiFetch(`/platform/tenants/${editing.id}/`, { method: "PATCH", token, body });
        toast.success(`Saved ${v.name}`);
      } else {
        await apiFetch("/platform/tenants/", { method: "POST", token, body });
        toast.success(`Created ${v.name}`, { description: `Its admin signs in at ${(body.domains as string[])[0]} as “${v.admin_username}”.` });
      }
      setEditing(null); load();
    } catch (e) { return errorText(e); }
  }
  async function toggle(t: Tenant) {
    try { await apiFetch(`/platform/tenants/${t.id}/`, { method: "PATCH", token, body: { is_active: !t.is_active } }); toast.success(`${t.name} is now ${t.is_active ? "suspended" : "active"}`); load(); }
    catch (e) { toast.error(errorText(e)); }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try { await apiFetch(`/platform/tenants/${deleting.id}/?confirm=${encodeURIComponent(confirm)}`, { method: "DELETE", token }); toast.success(`Deleted ${deleting.name} and all its data`); setDeleting(null); load(); }
    catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  }
  const overdue = (t: Tenant) => !!t.paid_until && new Date(t.paid_until) < new Date(new Date().toDateString());
  const initial = (t: Tenant): SiteValues => ({ ...BLANK, ...(t as unknown as SiteValues), domains: t.domains.join(", "), paid_until: t.paid_until || "",
    max_users: String(t.max_users ?? 0), monthly_price: String(t.monthly_price), owner_email: t.owner_email || "", notes: t.notes || "" });

  return (
    <div className="grid gap-8">
      <PageHeader title="Sites" description="Every client site, its plan and how much it's used."
        actions={<Button onClick={() => setEditing("new")}><Plus aria-hidden />New site</Button>} />
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {([["Client sites", stats?.tenants], ["Active", stats?.active], ["Monthly revenue", stats ? money(stats.mrr) : undefined], ["Accounts on client sites", stats?.users]] as const).map(([k, v]) => (
          <Card key={k} className="glass gap-1 py-4"><CardContent><dt className="text-sm text-muted-foreground">{k}</dt><dd className="text-2xl font-bold tabular-nums">{v ?? "—"}</dd></CardContent></Card>
        ))}
      </dl>

      <section aria-labelledby="sites-h" className="grid gap-3">
        <h2 id="sites-h" className="text-xl">Sites</h2>
        {tenants === null ? <Skeleton className="h-48 rounded-xl" /> : (
          <Card className="glass overflow-x-auto py-0">
            <Table>
              <TableHeader><TableRow><TableHead className="pl-4">Site</TableHead><TableHead>Domains</TableHead><TableHead>Plan</TableHead><TableHead>Includes</TableHead>
                <TableHead className="text-right">Accounts</TableHead><TableHead>Paid until</TableHead><TableHead>Status</TableHead><TableHead className="pr-4"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
              <TableBody>{tenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="pl-4"><b>{t.name}</b>{t.is_platform && <Badge variant="secondary" className="ml-2">Your site</Badge>}<div className="text-sm text-muted-foreground">{t.slug}</div></TableCell>
                  <TableCell>{t.domains.map((d) => <div key={d}><a href={siteLink(d)} target="_blank" rel="noopener noreferrer" className="text-brand-text underline-offset-2 hover:underline">{d}</a></div>)}</TableCell>
                  <TableCell>{PLANS.find(([v]) => v === t.plan)?.[1]}<div className="text-sm text-muted-foreground tabular-nums">{money(t.monthly_price)}/mo</div></TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{FEATURES.filter(([k]) => t[k]).map(([k, l]) => <Badge key={k} variant="outline">{l.split(" ")[0]}</Badge>)}</div></TableCell>
                  <TableCell className="text-right tabular-nums">{t.user_count}{t.max_users ? <span className="text-muted-foreground"> / {t.max_users}</span> : ""}</TableCell>
                  <TableCell>{t.paid_until ? shortDate(t.paid_until) : "—"}{overdue(t) && <StatusBadge tone="bad" className="ml-2">Overdue</StatusBadge>}</TableCell>
                  <TableCell><StatusBadge tone={t.is_active ? "ok" : "wait"}>{t.is_active ? "Active" : "Suspended"}</StatusBadge></TableCell>
                  <TableCell className="pr-4"><div className="flex justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => setEditing(t)}>Edit<span className="sr-only"> {t.name}</span></Button>
                    {!t.is_platform && <Button variant="ghost" size="sm" onClick={() => toggle(t)}>{t.is_active ? "Suspend" : "Activate"}</Button>}
                    {!t.is_platform && <Button variant="ghost" size="sm" className="text-destructive-text hover:text-destructive-text" onClick={() => { setDeleting(t); setConfirm(""); }}>Delete</Button>}
                  </div></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </Card>
        )}
      </section>

      <section aria-labelledby="usage-h" className="grid gap-3">
        <h2 id="usage-h" className="text-xl">Activity per site · last 30 days</h2>
        {usage === null ? <Skeleton className="h-40 rounded-xl" /> : (
          <Card className="glass overflow-x-auto py-0">
            <Table>
              <TableHeader><TableRow><TableHead className="pl-4">Site</TableHead><TableHead className="text-right">Players</TableHead><TableHead className="text-right">Active players</TableHead>
                <TableHead className="text-right">Messages</TableHead><TableHead className="text-right">Loads &amp; game ops</TableHead><TableHead className="pr-4">Last sign-in</TableHead></TableRow></TableHeader>
              <TableBody>{usage.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="pl-4"><b>{u.name}</b>{!u.is_active && <StatusBadge tone="wait" className="ml-2">Suspended</StatusBadge>}</TableCell>
                  <TableCell className="text-right tabular-nums">{u.players}</TableCell>
                  <TableCell className="text-right tabular-nums">{u.active_players}<span className="text-sm text-muted-foreground"> · {u.players ? Math.round((u.active_players / u.players) * 100) : 0}%</span></TableCell>
                  <TableCell className="text-right tabular-nums">{u.messages.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{u.loads.toLocaleString()}</TableCell>
                  <TableCell className="pr-4 text-muted-foreground">{u.last_activity ? shortDate(u.last_activity) : "never"}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </Card>
        )}
      </section>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing === "new" ? "New casino site" : `Edit ${editing?.name}`}</DialogTitle>
            <DialogDescription>{editing === "new" ? "Creates the site, its first admin account and (optionally) demo content." : "Plan, billing and features for this site."}</DialogDescription></DialogHeader>
          {editing && <SiteForm isNew={editing === "new"} initial={editing === "new" ? BLANK : initial(editing)} onSubmit={save} onCancel={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the site, its accounts, games, messages and payments. It can&apos;t be undone.</AlertDialogDescription></AlertDialogHeader>
          <Field><FieldLabel htmlFor="del-confirm">Type <b className="font-mono">{deleting?.slug}</b> to confirm</FieldLabel>
            <Input id="del-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></Field>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={busy || confirm !== deleting?.slug} onClick={remove}>
              {busy ? "Deleting…" : "Delete site"}</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
