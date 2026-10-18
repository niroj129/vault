"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Game } from "@/lib/types";

interface Login { id: number; game: number; game_name: string; username: string; password: string; note: string }
interface Player { id: number; username: string; full_name: string }

const addSchema = z.object({ game: z.string().min(1, "Choose a game."), username: z.string().trim().min(1, "Enter the username."), password: z.string().optional() });

function ApiTools({ r, onReload }: { r: Login; onReload: () => void }) {
  const { token } = useAuth();
  const [mode, setMode] = useState<"" | "load" | "withdraw">("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: string, amt?: string) {
    setBusy(true);
    try {
      const d = await apiFetch<{ balance?: string; password?: string; message?: string }>("/admin/game-accounts/", { method: "POST", token, body: { action, login: r.id, amount: amt } });
      toast.success(action === "balance" ? `Balance: ${d.balance ?? "—"}` : action === "reset" ? `New password: ${d.password}` : d.message || "Done");
      if (action === "reset") onReload();
      setMode(""); setAmount("");
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  }
  if (mode) {
    return (
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (Number(amount) > 0) void run(mode, amount); }}>
        <Field className="w-32"><FieldLabel htmlFor={`amt-${r.id}`}>{mode === "load" ? "Load" : "Redeem"} amount</FieldLabel>
          <Input id={`amt-${r.id}`} type="number" inputMode="decimal" min="0" step="0.01" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Button type="submit" size="sm" disabled={busy || !(Number(amount) > 0)}>{busy ? "…" : "Go"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setMode("")}>Cancel</Button>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      <Button size="xs" variant="outline" disabled={busy} onClick={() => run("balance")}>Balance</Button>
      <Button size="xs" variant="outline" disabled={busy} onClick={() => setMode("load")}>Load</Button>
      <Button size="xs" variant="outline" disabled={busy} onClick={() => setMode("withdraw")}>Redeem</Button>
      <Button size="xs" variant="outline" disabled={busy} onClick={() => run("reset")}>New password</Button>
      <Button size="xs" variant="outline" disabled={busy} onClick={() => run("kick")}>Kick out</Button>
    </div>
  );
}

/** Staff set a player's username/password per game (what the player sees in Game logins). */
export function GameLoginsEditor({ player, onClose }: { player: Player; onClose: () => void }) {
  const { token } = useAuth();
  const [rows, setRows] = useState<Login[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [removing, setRemoving] = useState<Login | null>(null);
  const form = useForm<z.infer<typeof addSchema>>({ resolver: zodResolver(addSchema), defaultValues: { game: "", username: "", password: "" } });
  const load = useCallback(() => apiFetch<Login[]>(`/game-logins/?user=${player.id}`, { token }).then(setRows).catch((e) => toast.error(errorText(e))), [player.id, token]);
  useEffect(() => { void load(); apiFetch<Game[]>("/games/", { token }).then(setGames).catch(() => {}); }, [load, token]);

  async function add(v: z.infer<typeof addSchema>) {
    try { await apiFetch("/game-logins/", { method: "POST", token, body: { ...v, game: Number(v.game), user: player.id } }); form.reset(); void load(); toast.success("Login added"); }
    catch (e) { form.setError("root", { message: (e as { data?: { non_field_errors?: string[] } }).data?.non_field_errors ? "This player already has a login for that game." : errorText(e) }); }
  }
  async function update(r: Login, patch: Partial<Login>) {
    try { const u = await apiFetch<Login>(`/game-logins/${r.id}/`, { method: "PATCH", token, body: patch }); setRows((rs) => rs.map((x) => (x.id === u.id ? u : x))); toast.success(`${r.game_name} login saved`); }
    catch (e) { toast.error(errorText(e)); }
  }
  async function remove() {
    if (!removing) return;
    try { await apiFetch(`/game-logins/${removing.id}/`, { method: "DELETE", token }); toast.success(`${removing.game_name} login removed`); void load(); }
    catch (e) { toast.error(errorText(e)); } finally { setRemoving(null); }
  }
  async function createViaApi(g: Game) {
    try { await apiFetch("/admin/game-accounts/", { method: "POST", token, body: { action: "create", user: player.id, game: g.id } }); toast.success(`${g.name} account created`); void load(); }
    catch (e) { toast.error(errorText(e)); }
  }
  const apiGames = new Set(games.filter((g) => g.provider).map((g) => g.id));
  const used = new Set(rows.map((r) => r.game));
  const { errors, isSubmitting } = form.formState;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Game logins · {player.full_name || player.username}</DialogTitle>
          <DialogDescription>The player sees these in Profile → Game logins. Edits save when you leave a field.</DialogDescription></DialogHeader>
        <ul className="grid gap-2">
          {rows.length === 0 && <li className="text-sm text-muted-foreground">No logins yet.</li>}
          {rows.map((r) => (
            <li key={r.id} className="grid gap-2 rounded-lg border bg-muted/40 p-3">
              <div className="grid items-end gap-2 sm:grid-cols-[8rem_1fr_1fr_auto]">
                <b className="self-center">{r.game_name}</b>
                <Field><FieldLabel htmlFor={`u-${r.id}`} className="text-xs">Username</FieldLabel>
                  <Input id={`u-${r.id}`} defaultValue={r.username} onBlur={(e) => e.target.value !== r.username && void update(r, { username: e.target.value })} /></Field>
                <Field><FieldLabel htmlFor={`p-${r.id}`} className="text-xs">Password</FieldLabel>
                  <Input id={`p-${r.id}`} defaultValue={r.password} onBlur={(e) => e.target.value !== r.password && void update(r, { password: e.target.value })} /></Field>
                <Button variant="ghost" size="icon" className="text-destructive-text hover:text-destructive-text" onClick={() => setRemoving(r)} aria-label={`Remove ${r.game_name} login`}><Trash2 aria-hidden /></Button>
              </div>
              {apiGames.has(r.game) && <ApiTools r={r} onReload={() => void load()} />}
            </li>
          ))}
        </ul>
        {games.some((g) => g.provider && !used.has(g.id)) && (
          <div className="flex flex-wrap items-center gap-2"><span className="text-sm text-muted-foreground">Create by API:</span>
            {games.filter((g) => g.provider && !used.has(g.id)).map((g) => <Button key={g.id} size="sm" variant="secondary" onClick={() => createViaApi(g)}><Plus aria-hidden />{g.name}</Button>)}
          </div>
        )}
        <form noValidate onSubmit={form.handleSubmit(add)} className="grid gap-2 border-t pt-4">
          <p className="text-sm font-semibold">Add an existing login</p>
          <div className="grid items-start gap-2 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
            <Controller control={form.control} name="game" render={({ field }) => (
              <Field data-invalid={!!errors.game}><FieldLabel htmlFor="gl-game" className="sr-only">Game</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="gl-game" className="w-full" aria-invalid={!!errors.game}><SelectValue placeholder="Game…" /></SelectTrigger>
                  <SelectContent>{games.filter((g) => !used.has(g.id)).map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}</SelectContent></Select>
                <FieldError>{errors.game?.message}</FieldError></Field>
            )} />
            <Field data-invalid={!!errors.username}><FieldLabel htmlFor="gl-user" className="sr-only">Username</FieldLabel>
              <Input id="gl-user" placeholder="Username" aria-invalid={!!errors.username} {...form.register("username")} /><FieldError>{errors.username?.message}</FieldError></Field>
            <Field><FieldLabel htmlFor="gl-pass" className="sr-only">Password</FieldLabel><Input id="gl-pass" placeholder="Password (optional)" {...form.register("password")} /></Field>
            <Button type="submit" disabled={isSubmitting}><Plus aria-hidden />Add</Button>
          </div>
          {errors.root && <p role="alert" className="text-sm text-destructive-text">{errors.root.message}</p>}
        </form>
        <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Remove the {removing?.game_name} login?</AlertDialogTitle>
              <AlertDialogDescription>The player won&apos;t see it in Game logins any more. The account on the game itself isn&apos;t touched.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Keep</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={remove}>Remove</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
