"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/common/copy-button";
import { ChoiceCards } from "@/components/play/choice-cards";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Platform, PlatformLogin } from "@/lib/types";
import { PlayerPicker } from "./player-picker";

/** Tie an account that exists on the platform to a site player, so loads and cash outs are recorded against someone. */
export function LinkDialog({ platform, username, open, onOpenChange, onLinked }: { platform: Platform; username: string; open: boolean; onOpenChange: (o: boolean) => void; onLinked: (l: PlatformLogin) => void }) {
  const { token } = useAuth();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [player, setPlayer] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<{ login: PlatformLogin; pw: string } | null>(null);

  async function submit() {
    setBusy(true); setError("");
    try {
      const r = await apiFetch<{ login: PlatformLogin; site_password: string | null }>(`/admin/platforms/${platform.id}/link/`, { method: "POST", token, body: mode === "new" ? { username, new_player: true } : { username, user: player } });
      if (r.site_password) setMade({ login: r.login, pw: r.site_password });
      else { toast.success(`${username} is now tied to @${r.login.player.username}`); onLinked(r.login); onOpenChange(false); }
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) { setMade(null); setError(""); } } }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        {made ? (
          <>
            <DialogHeader><DialogTitle>Player created and linked</DialogTitle><DialogDescription>@{made.login.player.username} now owns the {platform.name} account <b>{username}</b>. Give them their site login:</DialogDescription></DialogHeader>
            <div className="grid gap-1 rounded-lg border bg-muted/40 p-3 text-sm">
              <span className="flex items-center gap-2"><span className="w-20 text-muted-foreground">Username</span><code className="font-mono font-semibold">{made.login.player.username}</code><CopyButton value={made.login.player.username} label="username" size="icon-xs" /></span>
              <span className="flex items-center gap-2"><span className="w-20 text-muted-foreground">Password</span><code className="font-mono font-semibold">{made.pw}</code><CopyButton value={made.pw} label="password" size="icon-xs" /></span>
            </div>
            <DialogFooter><Button onClick={() => { onLinked(made.login); onOpenChange(false); setMade(null); }}>Done</Button></DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader><DialogTitle>Link {username} to a player</DialogTitle><DialogDescription>This {platform.name} account isn&apos;t tied to anyone on your site yet. Link it to load, redeem and keep records.</DialogDescription></DialogHeader>
            <ChoiceCards label="Who owns it" value={mode} onChange={(v) => setMode(v as typeof mode)} className="grid-cols-2" choices={[
              { value: "existing", label: "A player I have", description: "Pick from your players" }, { value: "new", label: "Make a new player", description: `Named “${username}”` }]} />
            {mode === "existing" && <PlayerPicker value={player} onChange={setPlayer} />}
            {error && <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm font-medium text-destructive-text">{error}</p>}
            <DialogFooter className="gap-2 sm:gap-2"><Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={submit} disabled={busy || (mode === "existing" && !player)} aria-busy={busy}>{busy ? <><Spinner aria-hidden />Linking…</> : <><Link2 aria-hidden />Link account</>}</Button></DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
