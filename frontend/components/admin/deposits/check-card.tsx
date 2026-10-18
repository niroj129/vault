"use client";

import { Check, ImageOff, Search, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { MailEvidenceBox } from "@/components/admin/mail/mail-evidence";
import { LoadedDialog } from "./loaded-dialog";
import { CopyButton } from "@/components/common/copy-button";
import { UserAvatar } from "@/components/common/user-avatar";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorText, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, money } from "@/lib/format";
import type { StaffDeposit } from "@/lib/types";

/** A "player says they paid our QR" card: screenshot + approve / decline. */
export function CheckCard({ d, onDone, onZoom }: { d: StaffDeposit; onDone: () => void; onZoom: (src: string) => void }) {
  const { token } = useAuth();
  const [amount, setAmount] = useState(String(Number(d.amount)));
  const [busy, setBusy] = useState("");
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [login, setLogin] = useState(d.login);
  const [uname, setUname] = useState("");
  const [loading, setLoading] = useState(false);
  const changed = Number(amount) !== Number(d.amount);
  const valid = Number(amount) > 0;

  async function go(action: "approve" | "load" | "reject", body: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      await apiFetch(`/admin/deposits/${d.id}/${action === "load" ? "approve" : action}/`, { method: "POST", token, body });
      toast.success(action === "reject" ? `Declined — @${d.user.username} was told` : action === "load" ? `Approved and loaded ${money(amount)}` : `Approved ${money(amount)} — now in To load`);
      onDone();
    } catch (e) { toast.error(errorText(e)); setBusy(""); }
  }
  async function saveLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!uname.trim() || !d.game) return;
    setBusy("login");
    try { await apiFetch("/game-logins/", { method: "POST", token, body: { user: d.user.id, game: d.game.id, username: uname.trim(), note: "Added by staff" } }); setLogin(uname.trim()); toast.success("Username saved"); }
    catch (err) { toast.error(errorText(err)); } finally { setBusy(""); }
  }

  return (
    <Card className="glass">
      <CardContent className="grid gap-4 sm:grid-cols-[8.5rem_1fr]">
        <button type="button" disabled={!d.proof} onClick={() => d.proof && onZoom(d.proof)} aria-label={d.proof ? `View @${d.user.username}'s screenshot` : "No screenshot"}
          className="group relative grid aspect-[3/4] place-items-center overflow-hidden rounded-lg border bg-muted disabled:cursor-default disabled:border-dashed sm:self-start">
          {d.proof ? <>
            <Image src={mediaUrl(d.proof)} alt="" fill sizes="136px" className="object-cover transition-[filter] duration-200 group-hover:brightness-110" />
            <span className="absolute right-1.5 bottom-1.5 grid size-8 place-items-center rounded-md bg-background/80 text-foreground"><Search className="size-4" aria-hidden /></span>
          </> : <span className="grid justify-items-center gap-1 text-sm text-muted-foreground"><ImageOff className="size-5" aria-hidden />No screenshot</span>}
        </button>
        <div className="grid content-start gap-3">
          <div className="flex items-center gap-3">
            <UserAvatar name={d.user.full_name || d.user.username} size={40} />
            <div className="grid min-w-0 flex-1"><b>@{d.user.username}</b><span className="text-sm text-muted-foreground">{ago(d.created_at)} · code <code className="font-mono">{d.code}</code></span></div>
            <span className="text-2xl font-bold tabular-nums">{money(d.amount)}</span>
          </div>
          <dl className="grid gap-2 text-sm">
            <div className="grid grid-cols-[7.5rem_1fr] items-center gap-2"><dt className="text-muted-foreground">Sent with</dt><dd className="font-semibold">{d.method_label}{d.pay_to?.handle && <span className="font-normal text-muted-foreground"> → {d.pay_to.handle}</span>}</dd></div>
            {d.player_note && <div className="grid grid-cols-[7.5rem_1fr] items-center gap-2"><dt className="text-muted-foreground">Name on account</dt><dd className="font-semibold">{d.player_note}</dd></div>}
            <div className="grid grid-cols-[7.5rem_1fr] items-start gap-2"><dt className="pt-2 text-muted-foreground">Load</dt>
              <dd className="flex flex-wrap items-center gap-2 font-semibold">{d.game?.name || "—"}
                {login ? <span className="flex items-center rounded-md bg-muted pl-2"><code className="font-mono">{login}</code><CopyButton value={login} label="game username" size="icon-xs" /></span> : d.game && (
                  <form onSubmit={saveLogin} className="flex w-full gap-2">
                    <label htmlFor={`un-${d.id}`} className="sr-only">{d.game.name} username for @{d.user.username}</label>
                    <Input id={`un-${d.id}`} value={uname} onChange={(e) => setUname(e.target.value)} placeholder="Create one, then type it here" maxLength={120} className="h-9" />
                    <Button type="submit" size="sm" variant="outline" disabled={!uname.trim() || busy === "login"}>Save</Button>
                  </form>
                )}</dd></div>
          </dl>
          {d.emails?.length ? <MailEvidenceBox e={d.emails[0]} expected={d.amount} /> : null}
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <Field className="mr-auto w-36"><FieldLabel htmlFor={`recv-${d.id}`} className="text-xs">Amount received</FieldLabel>
              <InputGroup className="h-9"><InputGroupAddon><InputGroupText>$</InputGroupText></InputGroupAddon>
                <InputGroupInput id={`recv-${d.id}`} type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular-nums" /></InputGroup></Field>
            <Button variant="ghost" size="sm" onClick={() => setDeclining(true)}><X aria-hidden />Not received</Button>
            <Button variant="outline" size="sm" disabled={!!busy || !valid} onClick={() => go("approve", changed ? { amount } : {})}>{busy === "approve" ? "Saving…" : "Approve"}</Button>
            <Button size="sm" disabled={!!busy || !valid || !login} title={login ? undefined : "Add a username first"} onClick={() => setLoading(true)}>
              <Check aria-hidden />{busy === "load" ? "Saving…" : "Approve & loaded"}</Button>
          </div>
          {!login && <p className="text-sm text-muted-foreground">“Approve &amp; loaded” needs the player&apos;s game username first.</p>}
        </div>
      </CardContent>
      <LoadedDialog deposit={loading ? d : null} paid={Number(amount)} username={d.user.username} title={`Approve ${money(amount)} and mark loaded?`} confirmLabel="Approve & loaded"
        onClose={() => setLoading(false)}
        onSubmit={async (v) => {
          await apiFetch(`/admin/deposits/${d.id}/approve/`, { method: "POST", token, body: { loaded: true, loaded_amount: v, ...(changed ? { amount } : {}) } });
          toast.success(`Approved and loaded ${money(v)}`); onDone();
        }} />
      <AlertDialog open={declining} onOpenChange={setDeclining}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Payment not received?</AlertDialogTitle>
            <AlertDialogDescription>@{d.user.username} gets a message that we couldn&apos;t find their {money(d.amount)} {d.method_label} payment.</AlertDialogDescription></AlertDialogHeader>
          <Field><FieldLabel htmlFor={`why-${d.id}`}>Reason <span className="font-normal text-muted-foreground">(optional, shown to the player)</span></FieldLabel>
            <Textarea id={`why-${d.id}`} rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={`e.g. No $${Number(d.amount)} from this name in our ${d.method_label}.`} />
            <FieldDescription>They can reply in Support with more proof.</FieldDescription></Field>
          <AlertDialogFooter><AlertDialogCancel>Back</AlertDialogCancel>
            <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={!!busy} onClick={() => go("reject", { note: reason })}>{busy === "reject" ? "Saving…" : "Decline payment"}</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
