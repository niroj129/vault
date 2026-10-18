"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownToLine, ExternalLink, Gamepad2, KeyRound, LogOut, MoreHorizontal, Pencil, Plus, RefreshCw, Wallet, Zap } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CopyButton } from "@/components/common/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import type { AdminUser, Game, StaffLogin } from "@/lib/types";
import { genPassword } from "./credentials";
import { LoadDialog } from "./load-dialog";
import { RedeemDialog } from "./redeem-dialog";

interface Bal { value: number | null; busy: boolean; error?: string }
const asList = <T,>(r: T[] | { results: T[] }) => (Array.isArray(r) ? r : r.results);

const loginSchema = z.object({ username: z.string().trim().min(1, "Enter the username."), password: z.string().trim() });
type LoginValues = z.infer<typeof loginSchema>;

/** Add or edit a username on a game that has no API. */
function ManualLoginDialog({ player, game, login, open, onOpenChange, onDone }: { player: AdminUser; game: Game; login?: StaffLogin; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const { token } = useAuth();
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), values: { username: login?.username || "", password: login?.password || "" } });
  const { errors, isSubmitting } = form.formState;
  async function submit(v: LoginValues) {
    try {
      const body = { user: player.id, game: game.id, username: v.username.trim(), password: v.password.trim() };
      await apiFetch(login ? `/game-logins/${login.id}/` : "/game-logins/", { method: login ? "PATCH" : "POST", token, body });
      toast.success(login ? "Login saved" : `${game.name} username added`); onDone(); onOpenChange(false);
    } catch (e) { form.setError("root", { message: errorText(e) }); }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{login ? "Edit" : "Add"} {game.name} login</DialogTitle>
          <DialogDescription>{game.name} has no API, so you create the account in its panel and save the details here for @{player.username}.</DialogDescription></DialogHeader>
        <form id="manual-login" noValidate onSubmit={form.handleSubmit(submit)} className="grid gap-4">
          <Field data-invalid={!!errors.username}><FieldLabel htmlFor="ml-user">Username</FieldLabel><Input id="ml-user" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={!!errors.username} {...form.register("username")} /><FieldError>{errors.username?.message}</FieldError></Field>
          <Field><FieldLabel htmlFor="ml-pw">Password <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="ml-pw" autoComplete="off" className="font-mono" {...form.register("password")} /></Field>
          {errors.root && <p role="alert" className="text-sm text-destructive-text">{errors.root.message}</p>}
        </form>
        <DialogFooter className="gap-2 sm:gap-2"><Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="manual-login" disabled={isSubmitting}>{isSubmitting ? <Spinner aria-hidden /> : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Secret({ value, label, revealed }: { value: string; label: string; revealed?: boolean }) {
  const [show, setShow] = useState(false);
  const on = show || !!revealed;
  return (
    <span className="flex items-center gap-1">
      <code className="min-w-0 truncate font-mono text-sm font-semibold">{value ? (on ? value : "••••••••") : "—"}</code>
      {value && <>
        <Button type="button" variant="ghost" size="xs" onClick={() => setShow((s) => !s)} aria-pressed={on} aria-label={`${on ? "Hide" : "Show"} ${label}`}>{on ? "Hide" : "Show"}</Button>
        <CopyButton value={value} label={label} size="icon-xs" />
      </>}
    </span>
  );
}

/** Every game, with this player's account on it: live balance, load, redeem and the account tools. */
export function GameAccounts({ player, onChanged }: { player: AdminUser; onChanged: () => void }) {
  const { token } = useAuth();
  const [games, setGames] = useState<Game[] | null>(null);
  const [logins, setLogins] = useState<StaffLogin[]>([]);
  const [bal, setBal] = useState<Record<number, Bal>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [fresh, setFresh] = useState<number | null>(null); // login whose new password is on show
  const [dlg, setDlg] = useState<{ kind: "load" | "redeem" | "login"; game: Game } | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const reloadLogins = useCallback(() => apiFetch<StaffLogin[] | { results: StaffLogin[] }>(`/game-logins/?user=${player.id}`, { token }).then((r) => alive.current && setLogins(asList(r))), [player.id, token]);
  useEffect(() => {
    setGames(null);
    Promise.all([apiFetch<Game[] | { results: Game[] }>("/games/", { token }), reloadLogins()])
      .then(([g]) => alive.current && setGames(asList(g).filter((x) => x.status === "active")))
      .catch((e) => { toast.error(errorText(e)); setGames([]); });
  }, [token, reloadLogins]);

  const fetchBal = useCallback(async (loginId: number) => {
    setBal((b) => ({ ...b, [loginId]: { value: b[loginId]?.value ?? null, busy: true } }));
    try {
      const r = await apiFetch<{ balance: string | number | null }>("/admin/game-accounts/", { method: "POST", token, body: { action: "balance", login: loginId } });
      if (alive.current) setBal((b) => ({ ...b, [loginId]: { value: r.balance == null || r.balance === "" ? null : Number(r.balance), busy: false } }));
    } catch (e) { if (alive.current) setBal((b) => ({ ...b, [loginId]: { value: null, busy: false, error: errorText(e) } })); }
  }, [token]);

  // live balances for API games, one at a time so the platform isn't hammered
  useEffect(() => {
    if (!games) return;
    let cancelled = false;
    (async () => { for (const l of logins) { const g = games.find((x) => x.id === l.game); if (cancelled) return; if (g?.provider) await fetchBal(l.id); } })();
    return () => { cancelled = true; };
  }, [games, logins, fetchBal]);

  async function action(key: string, body: Record<string, unknown>, ok: (d: Record<string, unknown>) => string) {
    setBusy(key);
    try { const d = await apiFetch<Record<string, unknown>>("/admin/game-accounts/", { method: "POST", token, body }); toast.success(ok(d)); return d; }
    catch (e) { toast.error(errorText(e)); return null; } finally { setBusy(null); }
  }
  const create = async (g: Game) => { const d = await action(`c${g.id}`, { action: "create", user: player.id, game: g.id }, (r) => `${g.name} account ready: ${(r.login as StaffLogin)?.username}`); if (d) { await reloadLogins(); onChanged(); } };
  const reset = async (l: StaffLogin) => { const pw = genPassword(); const d = await action(`r${l.id}`, { action: "reset", login: l.id, password: pw }, () => "New game password set"); if (d) { setFresh(l.id); await reloadLogins(); } };
  const kick = (l: StaffLogin) => void action(`k${l.id}`, { action: "kick", login: l.id }, () => "Kicked out of the game");

  if (!games) return <div className="grid gap-3" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>;
  if (!games.length) return <p className="rounded-lg border p-4 text-sm text-muted-foreground">There are no active games yet. An admin adds them under Games.</p>;

  const loginOf = (g: Game) => logins.find((l) => l.game === g.id);
  const sorted = [...games].sort((a, b) => Number(!!loginOf(b)) - Number(!!loginOf(a)) || a.name.localeCompare(b.name));
  const cur = dlg ? { game: dlg.game, login: loginOf(dlg.game), api: !!dlg.game.provider } : null;

  return (
    <>
      <ul className="grid gap-3" aria-label="Game accounts">
        {sorted.map((g) => {
          const l = loginOf(g); const api = !!g.provider; const b = l ? bal[l.id] : undefined;
          return (
            <li key={g.id} className="glass grid gap-3 rounded-xl border p-4">
              <div className="flex items-center gap-3">
                <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                  {g.thumbnail || g.logo ? <Image src={mediaUrl(g.logo || g.thumbnail)} alt="" fill sizes="44px" className="object-cover" /> : <Gamepad2 className="size-5" aria-hidden />}
                </span>
                <div className="grid min-w-0 flex-1 leading-tight"><b className="truncate">{g.name}</b>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{api ? <Badge variant="secondary" className="gap-1"><Zap className="size-3" aria-hidden />API</Badge> : <Badge variant="outline">By hand</Badge>}</span></div>
                {l && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`${g.name} account options`}><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {api && <DropdownMenuItem onSelect={() => void fetchBal(l.id)}><RefreshCw aria-hidden />Check balance</DropdownMenuItem>}
                      {api && <DropdownMenuItem onSelect={() => void reset(l)}><KeyRound aria-hidden />New game password</DropdownMenuItem>}
                      {api && <DropdownMenuItem onSelect={() => kick(l)}><LogOut aria-hidden />Kick out of game</DropdownMenuItem>}
                      {!api && <DropdownMenuItem onSelect={() => setDlg({ kind: "login", game: g })}><Pencil aria-hidden />Edit login</DropdownMenuItem>}
                      {g.user_link && <><DropdownMenuSeparator /><DropdownMenuItem asChild><a href={g.user_link} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden />Open game site</a></DropdownMenuItem></>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {l ? (
                <>
                  <dl className="grid gap-1 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
                    <dt className="text-muted-foreground">Username</dt><dd className="flex items-center gap-1"><code className="min-w-0 truncate font-mono font-semibold">{l.username}</code><CopyButton value={l.username} label="username" size="icon-xs" /></dd>
                    <dt className="text-muted-foreground">Password</dt><dd><Secret value={l.password} label="password" revealed={fresh === l.id} /></dd>
                  </dl>
                  <div className="flex flex-wrap items-center gap-2">
                    {api && (
                      <span className="mr-auto flex items-center gap-2 text-sm" aria-live="polite">
                        <span className="text-muted-foreground">Balance</span>
                        {b?.busy ? <Spinner className="size-4" aria-label="Checking balance" /> : b?.value != null ? <b className="text-lg tabular-nums">{money(b.value)}</b> : <span className="text-muted-foreground" title={b?.error}>{b?.error ? "unavailable" : "—"}</span>}
                        <Button variant="ghost" size="icon-xs" aria-label={`Refresh ${g.name} balance`} onClick={() => void fetchBal(l.id)} disabled={b?.busy}><RefreshCw aria-hidden /></Button>
                      </span>
                    )}
                    <Button size="sm" onClick={() => setDlg({ kind: "load", game: g })}><Wallet aria-hidden />Load</Button>
                    {api && <Button size="sm" variant="outline" onClick={() => setDlg({ kind: "redeem", game: g })}><ArrowDownToLine aria-hidden />Redeem</Button>}
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="mr-auto text-sm text-muted-foreground">No account on {g.name} yet.</p>
                  {api ? <Button size="sm" onClick={() => void create(g)} disabled={busy === `c${g.id}`} aria-busy={busy === `c${g.id}`}>{busy === `c${g.id}` ? <><Spinner aria-hidden />Creating…</> : <><Plus aria-hidden />Create account</>}</Button>
                    : <Button size="sm" variant="outline" onClick={() => setDlg({ kind: "login", game: g })}><Plus aria-hidden />Add username</Button>}
                  <Button size="sm" variant="outline" onClick={() => setDlg({ kind: "load", game: g })}><Wallet aria-hidden />Load</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {cur && dlg?.kind === "load" && <LoadDialog player={player} game={cur.game} login={cur.login} api={cur.api} open onOpenChange={(o) => !o && setDlg(null)} onDone={() => { void reloadLogins(); onChanged(); if (cur.login) void fetchBal(cur.login.id); }} />}
      {cur?.login && dlg?.kind === "redeem" && <RedeemDialog player={player} game={cur.game} login={cur.login} balance={bal[cur.login.id]?.value ?? null} open onOpenChange={(o) => !o && setDlg(null)} onDone={() => { onChanged(); void fetchBal(cur.login!.id); }} />}
      {cur && dlg?.kind === "login" && <ManualLoginDialog player={player} game={cur.game} login={cur.login} open onOpenChange={(o) => !o && setDlg(null)} onDone={() => { void reloadLogins(); onChanged(); }} />}
    </>
  );
}
