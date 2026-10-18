"use client";

import { Flag, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { UserAvatar } from "@/components/common/user-avatar";
import { StatusBadge } from "@/components/play/status-badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { useMessengerEvents } from "@/lib/messenger";

interface Report {
  id: number; status: string; action: string; reason_label: string; excerpt: string; details: string; created_at: string; handled_by: string; reports_against: number;
  reported: { id: number; username: string; full_name: string; avatar: string | null; is_active: boolean; muted_until: string | null };
  reporter: { username: string } | null;
}
const TABS = [["open", "Open"], ["resolved", "Resolved"], ["dismissed", "Dismissed"], ["all", "All"]] as const;
const DONE: Record<string, string> = { warn: "Warned", mute: "Muted", unmute: "Unmuted", ban: "Banned", dismiss: "Dismissed" };

export default function ReportsQueue() {
  const { token } = useAuth();
  const [tab, setTab] = useState<string>("open");
  const [data, setData] = useState<{ open: number; results: Report[] } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [banning, setBanning] = useState<Report | null>(null);
  const load = useCallback(() => { apiFetch<{ open: number; results: Report[] }>(`/messenger/reports/?status=${tab}`, { token }).then(setData).catch((e) => toast.error(errorText(e))); }, [tab, token]);
  useEffect(() => { setData(null); load(); }, [load]);
  useMessengerEvents((ev) => { if (ev.type === "report") load(); });
  async function act(r: Report, action: string, extra: Record<string, unknown> = {}) {
    setBusy(r.id);
    try { await apiFetch(`/messenger/reports/${r.id}/`, { method: "POST", token, body: { action, ...extra } }); toast.success(`${DONE[action] || "Done"}: @${r.reported.username}`); load(); }
    catch (e) { toast.error(errorText(e)); } finally { setBusy(null); }
  }
  return (
    <div className="grid gap-6">
      <PageHeader title="Reports" description="Players report people from a chat or a message. One decision settles every open report about that person." />
      <Tabs value={tab} onValueChange={setTab}><TabsList>{TABS.map(([k, l]) => <TabsTrigger key={k} value={k} className="px-4">{l}{k === "open" && data?.open ? ` · ${data.open}` : ""}</TabsTrigger>)}</TabsList></Tabs>
      {!data ? <Skeleton className="h-40 rounded-xl" /> : data.results.length === 0 ? (
        <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><ShieldCheck aria-hidden /></EmptyMedia><EmptyTitle>{tab === "open" ? "Nothing to review" : "No reports here"}</EmptyTitle>
          <EmptyDescription>Reports from players will appear here.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <ul className="grid gap-3">
          {data.results.map((r) => {
            const u = r.reported;
            const muted = !!u.muted_until && new Date(u.muted_until) > new Date();
            return (
              <li key={r.id}>
                <Card className="glass"><CardContent className="grid gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <UserAvatar name={u.full_name || u.username} src={u.avatar} size={44} />
                    <div className="grid min-w-0 flex-1"><b>{u.full_name || u.username}</b>
                      <span className="text-sm text-muted-foreground">@{u.username} · {r.reports_against} report{r.reports_against > 1 ? "s" : ""} total{!u.is_active && " · banned"}{muted && ` · muted until ${dateTime(u.muted_until!)}`}</span></div>
                    <StatusBadge tone="bad"><Flag className="size-3" aria-hidden />{r.reason_label}</StatusBadge>
                  </div>
                  {r.excerpt && <blockquote className="rounded-md border-l-4 border-destructive bg-muted p-3 text-sm">“{r.excerpt}”</blockquote>}
                  {r.details && <p className="rounded-md border-l-4 bg-muted p-3 text-sm">{r.details}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    {r.status === "open" ? (
                      <>
                        <Button asChild variant="ghost" size="sm"><Link href="/admin/messages">Open inbox</Link></Button>
                        <Button variant="ghost" size="sm" disabled={busy === r.id} onClick={() => act(r, "dismiss")}>Dismiss</Button>
                        <Button variant="outline" size="sm" disabled={busy === r.id} onClick={() => act(r, "warn")}>Warn</Button>
                        <Button variant="outline" size="sm" disabled={busy === r.id} onClick={() => act(r, "mute", { hours: 24 })}>Mute 24h</Button>
                        <Button size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={busy === r.id || !u.is_active} onClick={() => setBanning(r)}>Ban</Button>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">{DONE[r.action] || r.status}{r.handled_by && ` by ${r.handled_by}`}
                        {muted && <> · <Button variant="link" size="sm" className="px-1" onClick={() => act(r, "unmute")}>Unmute</Button></>}</p>
                    )}
                    <span className="ml-auto text-sm text-muted-foreground">by {r.reporter ? `@${r.reporter.username}` : "a deleted account"} · {dateTime(r.created_at)}</span>
                  </div>
                </CardContent></Card>
              </li>
            );
          })}
        </ul>
      )}
      <AlertDialog open={!!banning} onOpenChange={(o) => !o && setBanning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Ban @{banning?.reported.username}?</AlertDialogTitle>
            <AlertDialogDescription>They&apos;ll be signed out and can&apos;t sign in again until you re-enable the account in Players.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => banning && void act(banning, "ban")}>Ban</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
