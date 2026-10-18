"use client";

import { Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AdminUser, Promo } from "@/lib/types";

/** Pick the players a targeted promotion is for (or hidden from). Saves the whole list at once. */
export function PromoPlayers({ promo, onSaved }: { promo: Promo; onSaved: () => void }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<AdminUser[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const only = promo.audience === "only";

  useEffect(() => {
    if (!open) return;
    setPeople(null);
    Promise.all([
      apiFetch<AdminUser[]>("/users/?role=user", { token }),
      apiFetch<{ id: number }[]>(`/promos/${promo.id}/players/`, { token }),
    ]).then(([all, mine]) => { setPeople(all); setPicked(new Set(mine.map((u) => u.id))); })
      .catch((e) => { toast.error(errorText(e)); setPeople([]); });
  }, [open, promo.id, token]);

  const shown = useMemo(() => (people || []).filter((u) => !q.trim() || `${u.username} ${u.full_name}`.toLowerCase().includes(q.trim().toLowerCase())), [people, q]);
  const toggle = (id: number, on: boolean) => setPicked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/promos/${promo.id}/players/`, { method: "PUT", token, body: { user_ids: [...picked] } });
      toast.success(`${picked.size} player${picked.size === 1 ? "" : "s"} saved`); setOpen(false); onSaved();
    } catch (e) { toast.error(errorText(e)); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Choose players for ${promo.title}`}><Users aria-hidden /></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{only ? "Who gets this promotion" : "Who it's hidden from"}</DialogTitle>
          <DialogDescription>
            {only ? `Only the players you tick can see and use “${promo.title}”. Everyone else won't see it.`
              : `Everyone gets “${promo.title}” except the players you tick — they won't see it or be able to use it.`}
          </DialogDescription>
        </DialogHeader>
        <InputGroup><InputGroupAddon><Search aria-hidden /></InputGroupAddon>
          <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a player" aria-label="Find a player" /></InputGroup>
        <p className="text-sm text-muted-foreground" aria-live="polite">{picked.size} selected</p>
        {!people ? <Skeleton className="h-48" /> : (
          <ul className="grid max-h-72 gap-1 overflow-y-auto" aria-label="Players">
            {shown.map((u) => (
              <li key={u.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-accent">
                  <Checkbox checked={picked.has(u.id)} onCheckedChange={(c) => toggle(u.id, c === true)} aria-label={`@${u.username}`} />
                  <UserAvatar name={u.full_name || u.username} size={32} />
                  <span className="grid"><b>{u.full_name || u.username}</b><span className="text-sm text-muted-foreground">@{u.username}</span></span>
                </label>
              </li>
            ))}
            {!shown.length && <li className="p-4 text-center text-sm text-muted-foreground">No players found.</li>}
          </ul>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !people} aria-busy={saving}>{saving ? <><Spinner aria-hidden />Saving…</> : "Save players"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
