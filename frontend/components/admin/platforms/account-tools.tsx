"use client";

import { KeyRound, LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { genPassword } from "@/components/agent/credentials";
import { CopyButton } from "@/components/common/copy-button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Set a new game password (suggested, editable) and show it afterwards so it can be sent to the player. */
export function ResetPasswordDialog({ platformId, username, open, onOpenChange, onDone }: { platformId: number; username: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const { token } = useAuth();
  const [pw, setPw] = useState(() => genPassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) { setError("At least 6 characters."); return; }
    setBusy(true); setError("");
    try { await apiFetch(`/admin/platforms/${platformId}/account/`, { method: "POST", token, body: { action: "reset", username, password: pw } }); setDone(true); onDone(); }
    catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) { setDone(false); setError(""); setPw(genPassword()); } } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{done ? "Password changed" : `New game password for ${username}`}</DialogTitle>
          <DialogDescription>{done ? "Send it to the player. They sign in to the game with it." : "Changes the password on the game platform right away."}</DialogDescription>
        </DialogHeader>
        {done ? (
          <>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3"><code className="min-w-0 flex-1 truncate font-mono text-lg font-semibold">{pw}</code><CopyButton value={pw} label="password" /></div>
            <DialogFooter><Button onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="grid gap-4">
            <Field data-invalid={!!error}><FieldLabel htmlFor="rp-pw">Password</FieldLabel>
              <Input id="rp-pw" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" className="font-mono" aria-invalid={!!error} />
              <FieldDescription role={error ? "alert" : undefined} className={error ? "text-destructive-text" : undefined}>{error || "We made one for you. Edit it if the player asked for something specific."}</FieldDescription></Field>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setPw(genPassword())} disabled={busy}>New suggestion</Button>
              <Button type="submit" disabled={busy} aria-busy={busy}>{busy ? <><Spinner aria-hidden />Saving…</> : <><KeyRound aria-hidden />Set password</>}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Force the player out of the game (ask first: they lose their current round). */
export function KickDialog({ platformId, platformName, username, open, onOpenChange, onDone }: { platformId: number; platformName: string; username: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  async function kick() {
    setBusy(true);
    try { await apiFetch(`/admin/platforms/${platformId}/account/`, { method: "POST", token, body: { action: "kick", username } }); toast.success(`${username} was kicked out of the game`); onDone(); onOpenChange(false); }
    catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  }
  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Kick {username} out of the game?</AlertDialogTitle>
          <AlertDialogDescription>They&apos;re disconnected from {platformName} right away and can sign back in. Use it before loading or redeeming if the game says the player is in a round.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); void kick(); }} disabled={busy}>{busy ? <Spinner aria-hidden /> : <LogOut aria-hidden />}Kick out</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
