"use client";

import { Check, ImageIcon, Scale, Upload, Wallet } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/common/copy-button";
import { PageHeader } from "@/components/common/page-header";
import { UserAvatar } from "@/components/common/user-avatar";
import { ScreenshotDialog } from "@/components/admin/deposits/screenshot-dialog";
import { ProofPicker } from "@/components/play/proof-picker";
import { StatusBadge, redeemTone } from "@/components/play/status-badge";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorText, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, money, shortDate } from "@/lib/format";
import { basisLabel } from "@/lib/cashout";
import { useMessengerEvents } from "@/lib/messenger";
import type { StaffRedeem } from "@/lib/types";

const TABS = [["pending", "Waiting"], ["approved", "Pay the player"], ["failed", "Failed"], ["paid", "Paid"], ["rejected", "Declined"], ["", "All"]] as const;
type Pending = { r: StaffRedeem; kind: "approve" | "reject" | "paid" | "shot" } | null;

export default function RedeemsPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<string>("pending");
  const [rows, setRows] = useState<StaffRedeem[] | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    apiFetch<StaffRedeem[]>(`/admin/redeems/${tab ? `?status=${tab}` : ""}`, { token }).then(setRows).catch((e) => toast.error(errorText(e)));
  }, [tab, token]);
  useEffect(() => { setRows(null); load(); }, [load]);
  useMessengerEvents((ev) => { if (ev.type === "toast") load(); });

  async function run(r: StaffRedeem, action: string, body?: FormData | Record<string, unknown>) {
    setBusy(true);
    try {
      await apiFetch(`/admin/redeems/${r.id}/${action}/`, { method: "POST", token, body });
      toast.success(action === "approve" ? `Approved — now send ${money(r.amount)} to @${r.user.username}` : action === "paid" ? "Marked paid — the player was told"
        : action === "proof" ? (r.status === "paid" ? `Saved. @${r.user.username} got the receipt in their chat` : "Screenshot saved on this cash out")
        : action === "reject" ? "Declined — the player was told" : "Trying again");
      setPending(null); setNote(""); setProof(null); load();
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="Cash outs" description="Redeem the credits in the game's panel, click Approve, send the money, then Mark paid. The player gets a message at each step." />
      <Tabs value={tab} onValueChange={setTab}><TabsList className="scrollbar-none max-w-full justify-start overflow-x-auto">
        {TABS.map(([k, l]) => <TabsTrigger key={k || "all"} value={k} className="shrink-0 px-3">{l}</TabsTrigger>)}</TabsList></Tabs>
      {rows === null ? <Skeleton className="h-48 rounded-xl" /> : rows.length === 0 ? (
        <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><Wallet aria-hidden /></EmptyMedia><EmptyTitle>Nothing here</EmptyTitle>
          <EmptyDescription>Players request cash outs from Load &amp; cash out → Cash out.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => {
            const [tone, label] = redeemTone(r);
            return (
              <li key={r.id}>
                <Card className="glass"><CardContent className="grid gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {r.game?.thumbnail ? <span className="relative size-11 shrink-0 overflow-hidden rounded-md"><Image src={mediaUrl(r.game.logo || r.game.thumbnail)} alt="" fill sizes="44px" className="object-cover" /></span>
                      : <UserAvatar name={r.user.full_name || r.user.username} size={44} />}
                    <div className="grid min-w-0 flex-1"><b className="text-lg tabular-nums">{money(r.amount)} from {r.game?.name || "—"}</b>
                      <span className="text-sm text-muted-foreground">@{r.user.username}{r.login ? ` · game login ${r.login}` : ""}</span></div>
                    <StatusBadge tone={tone}>{label}</StatusBadge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted p-3">
                    <Wallet className="size-4 text-muted-foreground" aria-hidden />Send to <b>{r.payout_label || r.payout_method}</b>
                    <code className="font-mono">{r.payout_handle}</code><CopyButton value={r.payout_handle} label="payout handle" size="icon-xs" />
                  </div>
                  {r.rule && (
                    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <Scale className="size-4" aria-hidden />
                      Last load {money(r.rule.base)} {basisLabel(r.rule.basis)}{r.rule.load.loaded_at ? ` on ${shortDate(r.rule.load.loaded_at)}` : ""} · allowed {money(r.rule.min)}–{money(r.rule.max)}
                      <StatusBadge tone={r.rule.within ? "ok" : "bad"}>{r.rule.within ? "Within rule" : "Outside rule"}</StatusBadge>
                    </p>
                  )}
                  {r.error && <p className="text-sm text-destructive-text">{r.error}</p>}
                  {r.note && <p className="text-sm text-muted-foreground">{r.note}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-auto text-sm text-muted-foreground">Asked {dateTime(r.created_at)}{r.handled_by && ` · handled by ${r.handled_by}`}</span>
                    {r.player_proof && <Button variant="ghost" size="sm" onClick={() => setZoom(r.player_proof)}><ImageIcon aria-hidden />Player&apos;s screenshot</Button>}
                    {r.proof && <Button asChild variant="ghost" size="sm"><a href={mediaUrl(r.proof)} target="_blank" rel="noopener noreferrer"><ImageIcon aria-hidden />{r.status === "paid" ? "Receipt" : "Your screenshot"}</a></Button>}
                    <Button variant="ghost" size="sm" onClick={() => { setProof(null); setPending({ r, kind: "shot" }); }}><Upload aria-hidden />{r.proof ? "Replace screenshot" : "Upload screenshot"}</Button>
                    {(r.status === "pending" || r.status === "failed") && <Button variant="ghost" size="sm" onClick={() => setPending({ r, kind: "reject" })}>Decline</Button>}
                    {r.status === "pending" && <Button size="sm" onClick={() => setPending({ r, kind: "approve" })}>Approve</Button>}
                    {r.status === "failed" && <Button variant="outline" size="sm" disabled={busy} onClick={() => run(r, "retry")}>Try again</Button>}
                    {r.status === "approved" && <Button size="sm" onClick={() => setPending({ r, kind: "paid" })}><Check aria-hidden />Mark paid</Button>}
                  </div>
                </CardContent></Card>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={pending?.kind === "approve" || pending?.kind === "reject"} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.kind === "approve" ? `Approve ${money(pending.r.amount)} for @${pending.r.user.username}?` : "Decline this cash out?"}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.kind === "approve"
              ? `Make sure you've redeemed it from ${pending.r.login || "their"} ${pending.r.game?.name} account first.`
              : "The player gets a message with your reason."}</AlertDialogDescription>
          </AlertDialogHeader>
          {pending?.kind === "reject" && (
            <Field><FieldLabel htmlFor="rd-reason">Reason <span className="font-normal text-muted-foreground">(shown to the player)</span></FieldLabel>
              <Textarea id="rd-reason" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          )}
          <AlertDialogFooter><AlertDialogCancel>Back</AlertDialogCancel>
            <Button disabled={busy} className={pending?.kind === "reject" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              onClick={() => pending && void run(pending.r, pending.kind, pending.kind === "reject" ? { note } : undefined)}>
              {busy ? "Saving…" : pending?.kind === "approve" ? "Approve" : "Decline"}</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={pending?.kind === "paid"} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Paid {pending ? money(pending.r.amount) : ""} to @{pending?.r.user.username}?</DialogTitle>
            <DialogDescription>Send it to their {pending?.r.payout_label || pending?.r.payout_method} <code className="font-mono">{pending?.r.payout_handle}</code> first. Add a screenshot and the player gets it in their chat as a receipt.</DialogDescription></DialogHeader>
          <ProofPicker file={proof} onFile={setProof} label="Upload payment screenshot" hint="Optional — recommended" />
          <DialogFooter><Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
            <Button disabled={busy} aria-busy={busy} onClick={() => { if (!pending) return; const fd = new FormData(); if (proof) fd.append("proof", proof); void run(pending.r, "paid", fd); }}>
              <Check aria-hidden />{busy ? "Saving…" : "Mark paid"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={pending?.kind === "shot"} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{pending?.r.proof ? "Replace" : "Upload"} a screenshot for {pending ? money(pending.r.amount) : ""} to @{pending?.r.user.username}</DialogTitle>
            <DialogDescription>{pending?.r.status === "paid"
              ? "The player gets it in their chat as the receipt."
              : "It's saved on this cash out and sent to the player with the paid message. Use it for your own proof, such as the redeem in the game or the money you sent."}</DialogDescription></DialogHeader>
          {pending?.r.proof && (
            <div className="flex items-center gap-3 rounded-lg bg-muted p-3 text-sm">
              <span className="relative size-14 shrink-0 overflow-hidden rounded-md"><Image src={mediaUrl(pending.r.proof)} alt="Current screenshot" fill sizes="56px" className="object-cover" /></span>
              <span>Current screenshot. A new one replaces it.</span>
            </div>
          )}
          <ProofPicker file={proof} onFile={setProof} label="Choose a screenshot" hint="Tap to pick, or drop an image" />
          <DialogFooter><Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
            <Button disabled={busy || !proof} aria-busy={busy} onClick={() => { if (!pending || !proof) return; const fd = new FormData(); fd.append("proof", proof); void run(pending.r, "proof", fd); }}>
              <Upload aria-hidden />{busy ? "Saving…" : "Save screenshot"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ScreenshotDialog src={zoom} title="Player's screenshot" onClose={() => setZoom(null)} />
    </div>
  );
}
