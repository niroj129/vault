"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Bell, Check, RefreshCw, Send, Star, TriangleAlert, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { PasswordInput } from "@/components/auth/password-input";
import { PageHeader } from "@/components/common/page-header";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/play/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface PointRow { id: number; slug: string; name: string; sub_points: string; vendor_points: string; combined: string; low: boolean; live: boolean; synced_at: string | null }
interface Report { low_count: number; threshold: string; load_amount: string; telegram_configured: boolean; rows: PointRow[] }

const tgSchema = z.object({
  telegram_bot_token: z.string().trim(),
  telegram_chat_id: z.string().trim(),
  points_threshold: z.string().refine((v) => v !== "" && Number(v) >= 0, "Enter 0 or more."),
  load_amount: z.string().refine((v) => v !== "" && Number(v) >= 0, "Enter 0 or more."),
});
type TgValues = z.infer<typeof tgSchema>;

function PointsRow({ r, onSaved }: { r: PointRow; onSaved: () => void }) {
  const { token } = useAuth();
  const [sub, setSub] = useState(String(r.sub_points));
  const [vendor, setVendor] = useState(String(r.vendor_points));
  const [busy, setBusy] = useState<"save" | "alert" | null>(null);
  const changed = sub !== String(r.sub_points) || vendor !== String(r.vendor_points);
  async function save() {
    setBusy("save");
    try { await apiFetch(`/games/${r.slug}/`, { method: "PATCH", token, body: { sub_points: sub, vendor_points: vendor } }); toast.success(`${r.name} points updated`); onSaved(); }
    catch (e) { toast.error(errorText(e)); } finally { setBusy(null); }
  }
  async function alert() {
    setBusy("alert");
    try { const x = await apiFetch<{ ok: boolean }>("/telegram/alert/", { method: "POST", token, body: { game: r.id } }); x.ok ? toast.success(`Telegram alert sent for ${r.name}`) : toast.error("Telegram didn't accept the message. Check the bot token and chat ID."); }
    catch (e) { toast.error(errorText(e)); } finally { setBusy(null); }
  }
  return (
    <TableRow>
      <TableCell><b>{r.name}</b>
        {r.live && <div className="mt-1"><Badge variant="secondary" className="gap-1"><RefreshCw className="size-3" aria-hidden />Live from API</Badge></div>}</TableCell>
      <TableCell><Input aria-label={`${r.name} sub-distributor points`} type="number" inputMode="decimal" className="w-28" value={sub} readOnly={r.live} disabled={r.live} onChange={(e) => setSub(e.target.value)} /></TableCell>
      <TableCell><Input aria-label={`${r.name} vendor points`} type="number" inputMode="decimal" className="w-28" value={vendor} readOnly={r.live} disabled={r.live} onChange={(e) => setVendor(e.target.value)} /></TableCell>
      <TableCell><StatusBadge tone={r.low ? "wait" : "ok"}>{r.combined}{r.low ? " · low" : ""}</StatusBadge></TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Tooltip><TooltipTrigger asChild>
            <Button variant={changed ? "default" : "ghost"} size="icon" disabled={!changed || !!busy} onClick={save} aria-label={`Save ${r.name} points`}>{busy === "save" ? <Spinner /> : <Check aria-hidden />}</Button>
          </TooltipTrigger><TooltipContent>Save points</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" disabled={!!busy} onClick={alert} aria-label={`Send Telegram load alert for ${r.name}`}>{busy === "alert" ? <Spinner /> : <Bell aria-hidden />}</Button>
          </TooltipTrigger><TooltipContent>Send Telegram load alert</TooltipContent></Tooltip>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function AdminPoints() {
  const { token } = useAuth();
  const [report, setReport] = useState<Report | null>(null);
  const form = useForm<TgValues>({ resolver: zodResolver(tgSchema), defaultValues: { telegram_bot_token: "", telegram_chat_id: "", points_threshold: "", load_amount: "" } });
  const { errors, isSubmitting } = form.formState;

  const [syncing, setSyncing] = useState(false);
  const load = useCallback(() => { apiFetch<Report>("/points/report/", { token }).then(setReport).catch((e) => toast.error(errorText(e))); }, [token]);
  /** Ask each connected game platform for its points now. Quiet when nothing is connected. */
  const sync = useCallback(async (loud: boolean) => {
    setSyncing(true);
    try {
      const r = await apiFetch<{ synced: number }>("/admin/points/sync/", { method: "POST", token });
      if (loud) toast.success(r.synced ? `Updated points from ${r.synced} game platform${r.synced === 1 ? "" : "s"}` : "No connected game platform answered. Check Game APIs.");
      load();
    } catch (e) { if (loud) toast.error(errorText(e)); } finally { setSyncing(false); }
  }, [token, load]);
  useEffect(() => {
    if (!token) return;
    load();
    void sync(false); // points come from the game API automatically whenever this page opens
    apiFetch<Record<string, unknown>>("/settings/", { token }).then((s) => form.reset({
      telegram_bot_token: String(s.telegram_bot_token ?? ""), telegram_chat_id: String(s.telegram_chat_id ?? ""),
      points_threshold: String(s.points_threshold ?? ""), load_amount: String(s.load_amount ?? ""),
    })).catch(() => {});
  }, [token, load, sync, form]);

  async function saveTelegram(v: TgValues) {
    try { await apiFetch("/settings/", { method: "PUT", token, body: v }); toast.success("Telegram settings saved"); form.reset(v); load(); }
    catch (e) { form.setError("root", { message: errorText(e) }); }
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="Game points" description="Keep each game's points topped up. When a game drops below the threshold, staff get a Telegram reminder." />
      {!report ? <><StatGrid>{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</StatGrid><Skeleton className="h-64" /></> : <>
        <StatGrid>
          <StatCard icon={TriangleAlert} label={`Games below ${report.threshold}`} value={String(report.low_count)} tone={report.low_count ? "warn" : undefined} />
          <StatCard icon={Star} label="Alert threshold" value={String(report.threshold)} />
          <StatCard icon={Zap} label="Default load" value={String(report.load_amount)} />
          <StatCard icon={Send} label="Telegram" value={report.telegram_configured ? "On" : "Off"} note={report.telegram_configured ? "Alerts are sent" : "Add a bot below"} tone={report.telegram_configured ? undefined : "warn"} />
        </StatGrid>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground" aria-live="polite">{syncing ? "Updating from the game APIs…" : "Games on a connected platform update by themselves every few minutes."}</p>
          <Button variant="outline" onClick={() => void sync(true)} disabled={syncing} aria-busy={syncing}>{syncing ? <Spinner aria-hidden /> : <RefreshCw aria-hidden />}Update from game APIs</Button>
        </div>
        <Card className="glass py-0">
          <Table>
            <caption className="sr-only">Points per game. Edit a number, then save that row.</caption>
            <TableHeader><TableRow><TableHead>Game</TableHead><TableHead>Sub-distributor</TableHead><TableHead>Vendor</TableHead><TableHead>Combined</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {report.rows.map((r) => <PointsRow key={`${r.id}-${r.sub_points}-${r.vendor_points}`} r={r} onSaved={load} />)}
              {!report.rows.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No games yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
      </>}
      <Card className="glass max-w-xl">
        <CardHeader><CardTitle className="text-lg"><h2>Telegram setup</h2></CardTitle>
          <CardDescription>When a game's combined points drop below the threshold, a load reminder goes to your Telegram group.</CardDescription></CardHeader>
        <CardContent>
          <form noValidate onSubmit={form.handleSubmit(saveTelegram)}>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2"><FieldLabel htmlFor="tg-token">Bot token</FieldLabel>
                <PasswordInput id="tg-token" autoComplete="off" placeholder="123456:ABC-…" {...form.register("telegram_bot_token")} /></Field>
              <Field className="sm:col-span-2"><FieldLabel htmlFor="tg-chat">Group chat ID</FieldLabel>
                <Input id="tg-chat" placeholder="-1001234567890" {...form.register("telegram_chat_id")} />
                <FieldDescription>Add the bot to your group, then paste the group's ID.</FieldDescription></Field>
              <Field data-invalid={!!errors.points_threshold}><FieldLabel htmlFor="tg-th">Alert threshold</FieldLabel>
                <Input id="tg-th" type="number" inputMode="decimal" aria-invalid={!!errors.points_threshold} {...form.register("points_threshold")} />
                <FieldError>{errors.points_threshold?.message}</FieldError></Field>
              <Field data-invalid={!!errors.load_amount}><FieldLabel htmlFor="tg-load">Default load amount</FieldLabel>
                <Input id="tg-load" type="number" inputMode="decimal" aria-invalid={!!errors.load_amount} {...form.register("load_amount")} />
                <FieldError>{errors.load_amount?.message}</FieldError></Field>
              {errors.root && <FieldError className="sm:col-span-2">{errors.root.message}</FieldError>}
              <div className="sm:col-span-2"><Button type="submit" disabled={isSubmitting}>{isSubmitting && <Spinner />}{isSubmitting ? "Saving…" : "Save Telegram settings"}</Button></div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
