"use client";

import { ArrowDownToLine, ExternalLink, Gift, KeyRound, Link2, LogOut, Plus, Receipt, RefreshCw, UserX, Wallet, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LoadDialog } from "@/components/agent/load-dialog";
import { RedeemDialog } from "@/components/agent/redeem-dialog";
import { CopyButton } from "@/components/common/copy-button";
import { UserAvatar } from "@/components/common/user-avatar";
import { StatusBadge } from "@/components/play/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, dateTime, money } from "@/lib/format";
import type { AccountActivity, AccountHistory, AdminUser, Game, Platform, PlatformLookup } from "@/lib/types";
import { LinkDialog } from "./link-dialog";
import { KickDialog, ResetPasswordDialog } from "./account-tools";

const ACTIVITY: Record<AccountActivity["type"], { icon: LucideIcon; label: string }> = {
  load: { icon: Wallet, label: "Loaded" }, freeplay: { icon: Gift, label: "Free play" }, cashout: { icon: Receipt, label: "Cash out" },
  redeem: { icon: ArrowDownToLine, label: "Redeemed" }, freeload: { icon: Gift, label: "Free credits" },
};
const tone = (s: string): "ok" | "wait" | "bad" => (["approved", "paid", "success", "loaded"].includes(s) ? "ok" : ["rejected", "failed", "expired"].includes(s) ? "bad" : "wait");

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-0.5 rounded-xl border bg-muted/30 p-3"><span className="text-xs text-muted-foreground">{label}</span><b className="text-lg tabular-nums">{value}</b></div>;
}

/** One account on the platform: live balance, every action as a button, and its activity, transactions and details. */
export function AccountWorkspace({ platform, username, onChanged, onCreate }: { platform: Platform; username: string; onChanged: () => void; onCreate: (username: string) => void }) {
  const { token } = useAuth();
  const [res, setRes] = useState<PlatformLookup | null>(null);
  const [hist, setHist] = useState<AccountHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stamp, setStamp] = useState<number>(0);
  const [dlg, setDlg] = useState<"load" | "redeem" | "link" | "reset" | "kick" | null>(null);

  const lookup = useCallback(async () => {
    setLoading(true); setError("");
    try { setRes(await apiFetch<PlatformLookup>(`/admin/platforms/${platform.id}/lookup/`, { method: "POST", token, body: { username } })); setStamp(Date.now()); }
    catch (e) { setRes(null); setError(errorText(e)); } finally { setLoading(false); }
  }, [platform.id, username, token]);
  const history = useCallback(() => {
    apiFetch<AccountHistory>(`/admin/platforms/${platform.id}/history/?username=${encodeURIComponent(username)}`, { token }).then(setHist).catch(() => setHist(null));
  }, [platform.id, username, token]);
  useEffect(() => { setRes(null); setHist(null); void lookup(); history(); }, [lookup, history]);

  const login = res?.login || null;
  const refresh = () => { void lookup(); history(); onChanged(); };
  const player = login ? ({ id: login.player.id, username: login.player.username, full_name: login.player.full_name } as AdminUser) : null;
  const game = login ? ({ id: login.game, name: login.game_name } as Game) : null;
  const balance = res?.balance != null && res.balance !== "" ? Number(res.balance) : null;

  if (loading && !res) return <div className="grid gap-4" aria-busy="true"><Skeleton className="h-56 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>;
  if (error) return <Alert variant="destructive"><UserX aria-hidden /><AlertTitle>Couldn&apos;t reach {platform.name}</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-2">{error}<Button size="sm" variant="outline" onClick={() => void lookup()}>Try again</Button></AlertDescription></Alert>;
  if (res && !res.found) {
    return (
      <div className="glass grid justify-items-center gap-3 rounded-2xl border p-8 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-warning/15 text-warning"><UserX className="size-7" aria-hidden /></span>
        <h2 className="text-xl font-semibold">No account named “{username}”</h2>
        <p className="max-w-md text-muted-foreground">{res.message || "Check the spelling, or create it."} This looks on {platform.name} itself, so it also finds accounts made in its own panel.</p>
        <Button onClick={() => onCreate(username)}><Plus aria-hidden />Create “{username}”</Button>
      </div>
    );
  }
  if (!res) return null;

  return (
    <div className="grid gap-4">
      <section aria-label={`Account ${res.username}`} className="glass overflow-hidden rounded-2xl border">
        <div className="flex flex-wrap items-center gap-4 bg-[radial-gradient(80%_140%_at_0%_0%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_70%)] p-5">
          <UserAvatar name={res.username} size={60} />
          <div className="grid min-w-0 flex-1 gap-1.5">
            <h2 className="flex items-center gap-1 text-2xl font-bold"><span className="truncate">{res.username}</span><CopyButton value={res.username} label="login name" size="icon-xs" /></h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{platform.name}</Badge>
              {login ? <span className="text-muted-foreground">Player <b className="text-foreground">{login.player.full_name || login.player.username}</b> · @{login.player.username}</span> : <Badge variant="outline">Not linked to a player</Badge>}
            </div>
          </div>
          <div className="grid justify-items-end gap-0.5" aria-live="polite">
            <span className="text-sm text-muted-foreground">Balance</span>
            <b className="text-4xl leading-none tabular-nums">{balance != null ? money(balance) : "—"}</b>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">{loading ? "updating…" : `updated ${ago(new Date(stamp).toISOString())}`}
              <Button variant="ghost" size="icon-xs" onClick={() => void lookup()} disabled={loading} aria-label="Refresh balance">{loading ? <Spinner aria-hidden /> : <RefreshCw aria-hidden />}</Button></span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t p-4 sm:grid-cols-4">
          <Button size="lg" disabled={!login} onClick={() => setDlg("load")}><Wallet aria-hidden />Load</Button>
          <Button size="lg" variant="outline" disabled={!login} onClick={() => setDlg("redeem")}><ArrowDownToLine aria-hidden />Redeem</Button>
          <Button size="lg" variant="outline" disabled={!login} onClick={() => setDlg("reset")}><KeyRound aria-hidden />New password</Button>
          <Button size="lg" variant="outline" disabled={!login} onClick={() => setDlg("kick")}><LogOut aria-hidden />Kick out</Button>
        </div>
        {!login && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-warning/10 p-4 text-sm">
            <span><b>Link this account to a player</b> to load, redeem and keep a history. Loads and cash outs are recorded against someone, so your numbers stay right.</span>
            <Button onClick={() => setDlg("link")}><Link2 aria-hidden />Link to a player</Button>
          </div>
        )}
      </section>

      <Tabs defaultValue="activity" className="gap-4">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="activity" className="flex-1 px-5 sm:flex-none">Activity</TabsTrigger>
          <TabsTrigger value="transactions" className="flex-1 px-5 sm:flex-none">Transactions</TabsTrigger>
          <TabsTrigger value="details" className="flex-1 px-5 sm:flex-none">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="grid gap-4">
          {!login ? <p className="glass rounded-xl border p-6 text-center text-sm text-muted-foreground">Nothing recorded yet. Once this account is linked to a player, their loads, free play and cash outs show up here.</p> : (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Stat label="Loaded to the game" value={money(hist?.totals.loaded)} /><Stat label="Redeemed from the game" value={money(hist?.totals.redeemed)} />
                <Stat label="Paid by the player" value={money(hist?.totals.paid)} /><Stat label="Cashed out to them" value={money(hist?.totals.cashed_out)} />
              </div>
              {!hist ? <Skeleton className="h-40 rounded-xl" /> : !hist.activity.length ? <p className="glass rounded-xl border p-6 text-center text-sm text-muted-foreground">No loads or cash outs yet.</p> : (
                <ol className="grid gap-2" aria-label="Activity, newest first">
                  {hist.activity.map((a) => {
                    const meta = ACTIVITY[a.type];
                    const done = a.type === "cashout" || a.type === "redeem" || a.type === "freeload" ? a.status : a.status === "approved" ? (a.load_status === "loaded" ? "loaded" : a.load_status || "approved") : a.status;
                    return (
                      <li key={a.key} className="glass flex items-center gap-3 rounded-xl border p-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted"><meta.icon className="size-5" aria-hidden /></span>
                        <span className="grid min-w-0 flex-1 leading-tight">
                          <b>{meta.label} {money(a.amount)}{a.type === "load" && Number(a.credits) !== Number(a.amount) ? <span className="font-normal text-muted-foreground"> → {money(a.credits)} credits</span> : null}</b>
                          <span className="text-xs text-muted-foreground">{a.method}{a.promo ? ` · promo ${a.promo}` : ""} · {dateTime(a.at)}</span>
                        </span>
                        <StatusBadge tone={tone(done)}>{done.replace("_", " ")}</StatusBadge>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="transactions">
          {!login ? <p className="glass rounded-xl border p-6 text-center text-sm text-muted-foreground">The ledger starts once this account is linked to a player.</p>
            : !hist ? <Skeleton className="h-40 rounded-xl" />
            : !hist.transactions.length ? <p className="glass rounded-xl border p-6 text-center text-sm text-muted-foreground">No loads or redeems sent to {platform.name} yet.</p> : (
              <div className="glass overflow-x-auto rounded-xl border">
                <Table>
                  <caption className="sr-only">Loads and redeems sent to {platform.name} for {res.username}, newest first</caption>
                  <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Balance after</TableHead><TableHead>Method</TableHead><TableHead>By</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {hist.transactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="whitespace-nowrap">{dateTime(t.created_at)}</TableCell>
                        <TableCell>{t.kind === "load" ? "Load" : "Redeem"}</TableCell>
                        <TableCell className={`text-right font-semibold tabular-nums ${t.kind === "load" ? "text-success" : ""}`}>{t.kind === "load" ? "+" : "−"}{money(t.amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.balance_after != null && t.balance_after !== "" ? money(t.balance_after) : "—"}</TableCell>
                        <TableCell>{t.method || "—"}</TableCell><TableCell>{t.operator || "—"}</TableCell>
                        <TableCell><StatusBadge tone={tone(t.status)}>{t.status}</StatusBadge>{t.status !== "success" && t.note ? <span className="mt-1 block max-w-48 text-xs text-muted-foreground">{t.note}</span> : null}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
        </TabsContent>

        <TabsContent value="details">
          <dl className="grid gap-2 sm:grid-cols-2">
            {([["Login name", res.username, true], ["Game password", login?.password || "", true], ["Platform ID", res.platform_user_id, true], ["Platform", `${platform.name} (${platform.kind_label.split(" — ")[0]})`, false],
              ["Player", login ? `${login.player.full_name || login.player.username} (@${login.player.username})` : "Not linked", false], ["Game", login?.game_name || platform.games.map((g) => g.name).join(", ") || "—", false]] as const).map(([k, v, copy]) => (
              <div key={k} className="glass grid gap-0.5 rounded-xl border p-3"><dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="flex items-center gap-1 font-medium"><span className="min-w-0 break-words">{v || "—"}</span>{copy && v ? <CopyButton value={String(v)} label={k.toLowerCase()} size="icon-xs" /> : null}</dd></div>
            ))}
            {res.play_url && <div className="glass grid gap-1 rounded-xl border p-3 sm:col-span-2"><dt className="text-xs text-muted-foreground">Quick sign-in link</dt><dd><Button asChild variant="outline" size="sm"><a href={res.play_url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden />Open in the game</a></Button></dd></div>}
          </dl>
        </TabsContent>
      </Tabs>

      {login && player && game && dlg === "load" && <LoadDialog player={player} game={game} login={login} api open onOpenChange={(o) => !o && setDlg(null)} onDone={refresh} />}
      {login && player && game && dlg === "redeem" && <RedeemDialog player={player} game={game} login={login} balance={balance} open onOpenChange={(o) => !o && setDlg(null)} onDone={refresh} />}
      {login && dlg === "reset" && <ResetPasswordDialog login={login} open onOpenChange={(o) => !o && setDlg(null)} onDone={() => { history(); void lookup(); }} />}
      {login && dlg === "kick" && <KickDialog login={login} open onOpenChange={(o) => !o && setDlg(null)} onDone={refresh} />}
      {!login && dlg === "link" && <LinkDialog platform={platform} username={res.username} open onOpenChange={(o) => !o && setDlg(null)} onLinked={() => { refresh(); }} />}
    </div>
  );
}
