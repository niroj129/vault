"use client";

import { LoadedDialog } from "@/components/admin/deposits/loaded-dialog";

import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, Eye, EyeOff, Flag, KeyRound, Lock, NotebookPen, Plus, Trash2, Wallet, X, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CopyButton } from "@/components/common/copy-button";
import { lastSeenLabel, UserAvatar } from "@/components/common/user-avatar";
import { StatusBadge, depositTone, redeemTone } from "@/components/play/status-badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import type { Deposit, Redeem } from "@/lib/types";

interface Reply { id: number; title: string; body: string }
const replySchema = z.object({ title: z.string().trim().min(1, "Give it a short name.").max(60), body: z.string().trim().min(1, "Write the reply.").max(2000) });

function ManageReplies({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { token } = useAuth();
  const [rows, setRows] = useState<Reply[]>([]);
  const form = useForm<z.infer<typeof replySchema>>({ resolver: zodResolver(replySchema), defaultValues: { title: "", body: "" } });
  const load = useCallback(() => apiFetch<Reply[]>("/messenger/saved-replies/", { token }).then(setRows).catch(() => {}), [token]);
  useEffect(() => { if (open) void load(); }, [open, load]);
  async function add(v: z.infer<typeof replySchema>) {
    try { await apiFetch("/messenger/saved-replies/", { method: "POST", token, body: v }); form.reset(); void load(); toast.success("Reply saved"); }
    catch (e) { form.setError("root", { message: errorText(e) }); }
  }
  async function remove(r: Reply) {
    try { await apiFetch(`/messenger/saved-replies/${r.id}/`, { method: "DELETE", token }); void load(); toast.success(`Deleted “${r.title}”`); }
    catch (e) { toast.error(errorText(e)); }
  }
  const { errors, isSubmitting } = form.formState;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Saved replies</DialogTitle><DialogDescription>Answers you type often, one tap away in any chat.</DialogDescription></DialogHeader>
        <form noValidate onSubmit={form.handleSubmit(add)}>
          <FieldGroup>
            <Field data-invalid={!!errors.title}><FieldLabel htmlFor="sr-title">Short name</FieldLabel>
              <Input id="sr-title" maxLength={60} placeholder="e.g. How to load" aria-invalid={!!errors.title} {...form.register("title")} /><FieldError>{errors.title?.message}</FieldError></Field>
            <Field data-invalid={!!errors.body}><FieldLabel htmlFor="sr-body">Reply</FieldLabel>
              <Textarea id="sr-body" rows={3} maxLength={2000} aria-invalid={!!errors.body} {...form.register("body")} /><FieldError>{errors.body?.message}</FieldError></Field>
            {errors.root && <p role="alert" className="text-sm text-destructive-text">{errors.root.message}</p>}
            <Button type="submit" className="w-fit" disabled={isSubmitting}><Plus aria-hidden />Add reply</Button>
          </FieldGroup>
        </form>
        <ul className="grid max-h-60 gap-1 overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-2 rounded-md bg-muted p-3">
              <div className="grid min-w-0 flex-1"><b>{r.title}</b><span className="line-clamp-2 text-sm text-muted-foreground">{r.body}</span></div>
              <Button variant="ghost" size="icon-sm" onClick={() => remove(r)} aria-label={`Delete ${r.title}`}><Trash2 aria-hidden /></Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** Lightning button in the composer: pick a saved reply to insert. */
export function SavedReplies({ onPick }: { onPick: (text: string) => void }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [rows, setRows] = useState<Reply[] | null>(null);
  useEffect(() => { if (open) apiFetch<Reply[]>("/messenger/saved-replies/", { token }).then(setRows).catch(() => setRows([])); }, [open, token]);
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Saved replies"><Zap aria-hidden /></Button></PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-80 p-0">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h3 className="text-sm font-semibold">Saved replies</h3>
            <Button variant="link" size="sm" onClick={() => { setOpen(false); setManage(true); }}>Manage</Button>
          </div>
          <ScrollArea className="max-h-72">
            <ul className="grid gap-0.5 p-1">
              {rows === null && <li><Skeleton className="h-14" /></li>}
              {rows?.length === 0 && <li className="p-3 text-sm text-muted-foreground">None yet. Add answers you type often.</li>}
              {rows?.map((r) => (
                <li key={r.id}><button type="button" onClick={() => { onPick(r.body); setOpen(false); }}
                  className="grid min-h-11 w-full gap-0.5 rounded-md p-2 text-left transition-colors duration-150 hover:bg-accent">
                  <b className="text-sm">{r.title}</b><span className="line-clamp-2 text-sm text-muted-foreground">{r.body}</span></button></li>
              ))}
            </ul>
          </ScrollArea>
        </PopoverContent>
      </Popover>
      <ManageReplies open={manage} onOpenChange={setManage} />
    </>
  );
}

interface Panel {
  user: { id: number; username: string; full_name: string; avatar: string | null; online: boolean; last_seen: string | null; is_active: boolean;
    date_joined: string; agent: string | null; muted_until: string | null; phone: string };
  vip_tier: string; loyalty_points: number; vip_next: { name: string; points: number; progress: number } | null;
  total_loaded: string | number; deposit_count: number; deposits: Deposit[]; redeems: Redeem[];
  game_logins: { id: number; game_name: string; username: string; password: string }[]; open_reports: number; notes: string;
}

/** Everything staff need beside a player's chat: money, logins, notes. */
export function PlayerPanel({ userId, onClose }: { userId: number; onClose?: () => void }) {
  const { token, user: me } = useAuth();
  const [d, setD] = useState<Panel | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [show, setShow] = useState<Record<number, boolean>>({});
  const [confirm, setConfirm] = useState<Deposit | null>(null);
  const load = useCallback(() => apiFetch<Panel>(`/messenger/players/${userId}/panel/`, { token })
    .then((r) => { setD(r); setNotes(r.notes || ""); }).catch((e) => setError(e.status === 404 ? "Not one of your players." : errorText(e))), [userId, token]);
  useEffect(() => { setD(null); setError(""); void load(); }, [load]);

  async function saveNotes() {
    if (!d || notes === d.notes) return;
    try { await apiFetch(`/messenger/players/${userId}/panel/`, { method: "PATCH", token, body: { notes } }); setD({ ...d, notes }); toast.success("Notes saved"); }
    catch (e) { toast.error(errorText(e)); }
  }
  async function markLoaded(x: Deposit, loaded: string) {
    await apiFetch(`/admin/deposits/${x.id}/mark-loaded/`, { method: "POST", token, body: { loaded_amount: loaded } });
    toast.success(`Marked ${money(loaded)} loaded`); void load();
  }

  if (error) return <aside className="w-full p-4 text-sm text-muted-foreground lg:w-80">{error}</aside>;
  if (!d) return <aside className="grid w-full content-start gap-3 p-4 lg:w-80"><Skeleton className="h-20" /><Skeleton className="h-40" /></aside>;
  const u = d.user;
  return (
    <aside aria-label="Player details" className="w-full lg:w-80">
      <ScrollArea className="h-full">
        <div className="grid gap-5 p-4">
          <div className="flex items-center gap-3">
            <UserAvatar name={u.full_name || u.username} src={u.avatar} size={48} online={u.online} />
            <div className="grid min-w-0 flex-1"><b className="truncate">{u.full_name || u.username}</b>
              <span className="truncate text-sm text-muted-foreground">@{u.username} · {lastSeenLabel(u.online, u.last_seen) || "Offline"}</span></div>
            {onClose && <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Hide player details"><X aria-hidden /></Button>}
          </div>
          {u.muted_until && new Date(u.muted_until) > new Date() && <p className="flex items-center gap-2 rounded-md bg-warning/15 p-2 text-sm text-warning"><Ban className="size-4" aria-hidden />Muted until {new Date(u.muted_until).toLocaleString()}</p>}
          {d.open_reports > 0 && <Link href="/admin/reports" className="flex items-center gap-2 rounded-md bg-destructive/15 p-2 text-sm font-medium text-destructive-text"><Flag className="size-4" aria-hidden />{d.open_reports} open report{d.open_reports > 1 ? "s" : ""}</Link>}
          {!u.is_active && <p className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm"><Lock className="size-4" aria-hidden />Account disabled</p>}

          <dl className="grid grid-cols-3 gap-2">
            {([["Loaded", money(d.total_loaded)], ["Deposits", d.deposit_count], ["Points", d.loyalty_points]] as const).map(([k, v]) => (
              <div key={k} className="rounded-md bg-muted p-2"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-bold tabular-nums">{v}</dd></div>
            ))}
          </dl>
          <div className="grid gap-1.5">
            <div className="flex justify-between text-sm"><span className="font-semibold">{d.vip_tier}</span>
              {d.vip_next && <span className="text-muted-foreground">{d.vip_next.points - d.loyalty_points} pts to {d.vip_next.name}</span>}</div>
            <Progress value={Math.round((d.vip_next ? d.vip_next.progress : 1) * 100)} aria-label="VIP progress" />
          </div>

          <section className="grid gap-2" aria-labelledby="pp-logins">
            <h3 id="pp-logins" className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase"><KeyRound className="size-4" aria-hidden />Game logins</h3>
            {d.game_logins.length === 0 && <p className="text-sm text-muted-foreground">None yet. <Link className="font-semibold text-brand-text underline underline-offset-2" href={`/admin/players?logins=${u.id}`}>Add logins</Link></p>}
            {d.game_logins.map((g) => (
              <div key={g.id} className="grid gap-1 rounded-md bg-muted p-2 text-sm">
                <b>{g.game_name}</b>
                <span className="flex flex-wrap items-center gap-1"><code className="font-mono">{g.username}</code><CopyButton value={g.username} label="username" size="icon-xs" />
                  <code className="font-mono">{show[g.id] ? g.password || "—" : "••••••"}</code>
                  <Button variant="ghost" size="icon-xs" onClick={() => setShow((s) => ({ ...s, [g.id]: !s[g.id] }))} aria-label={show[g.id] ? "Hide password" : "Show password"} aria-pressed={!!show[g.id]}>
                    {show[g.id] ? <EyeOff aria-hidden /> : <Eye aria-hidden />}</Button></span>
              </div>
            ))}
          </section>

          <section className="grid gap-2" aria-labelledby="pp-pay">
            <h3 id="pp-pay" className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase"><Wallet className="size-4" aria-hidden />Payments
              <Link href="/admin/deposits?tab=all" className="ml-auto inline-flex min-h-8 items-center text-xs normal-case tracking-normal text-brand-text hover:underline">All</Link></h3>
            {!d.deposits.length && !d.redeems.length && <p className="text-sm text-muted-foreground">No payments yet.</p>}
            <ul className="divide-y">
              {d.deposits.map((x) => {
                const toCheck = x.status === "pending" && x.direct;
                const toLoad = x.status === "approved" && (x.load_status === "manual" || x.load_status === "failed");
                const [tone, label] = depositTone(x);
                return (
                  <li key={`d${x.id}`} className="flex items-center gap-2 py-2">
                    <span className="grid min-w-0 flex-1 text-sm"><b className="tabular-nums">+{money(x.amount)} · {x.game?.name || "—"}</b>
                      <span className="text-muted-foreground">{x.method_label} · {shortDate(x.created_at)}</span></span>
                    {toCheck ? <Button asChild size="xs" variant="outline"><Link href="/admin/deposits?tab=check">Check</Link></Button>
                      : toLoad ? <Button size="xs" onClick={() => setConfirm(x)}>Mark loaded</Button>
                      : <StatusBadge tone={tone}>{label}</StatusBadge>}
                  </li>
                );
              })}
              {d.redeems.map((r) => {
                const [tone, label] = redeemTone(r);
                return (
                  <li key={`r${r.id}`} className="flex items-center gap-2 py-2">
                    <span className="grid min-w-0 flex-1 text-sm"><b className="tabular-nums">−{money(r.amount)} · {r.game?.name || "—"}</b>
                      <span className="text-muted-foreground">Cash out · {r.payout_label || r.payout_method}</span></span>
                    {r.status === "pending" || r.status === "approved" ? <Button asChild size="xs" variant="outline"><Link href="/admin/redeems">{r.status === "pending" ? "Review" : "Pay"}</Link></Button>
                      : <StatusBadge tone={tone}>{label}</StatusBadge>}
                  </li>
                );
              })}
            </ul>
          </section>

          <Field>
            <FieldLabel htmlFor="pp-notes" className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase"><NotebookPen className="size-4" aria-hidden />Staff notes</FieldLabel>
            <Textarea id="pp-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} placeholder="Only staff see this. Saved when you click away." />
          </Field>
          <p className="text-sm text-muted-foreground">Joined {shortDate(u.date_joined)}{u.agent ? ` · Agent ${u.agent}` : ""}{me?.role === "admin" && u.phone ? ` · ${u.phone}` : ""}</p>
        </div>
      </ScrollArea>
      <LoadedDialog deposit={confirm} username={u.username} onClose={() => setConfirm(null)} onSubmit={(v) => markLoaded(confirm!, v)} />
    </aside>
  );
}
