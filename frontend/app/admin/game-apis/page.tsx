"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Layers, Pencil, Plug, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { PasswordInput } from "@/components/auth/password-input";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge, type Tone } from "@/components/play/status-badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText, fieldErrors } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Kind { value: string; label: string; fields: string[] }
interface Provider {
  id: number; name: string; kind: string; kind_label: string; base_url: string; agent_name: string; app_id: string;
  token_upper: boolean; ms_timestamp: boolean; account_prefix: string; use_doh: boolean; force_ip: string | null; proxy_url: string;
  last_egress_ip: string; is_active: boolean; last_agent_balance: string; last_checked: string | null; last_error: string;
  game_count: number; has_password: boolean; has_secret: boolean;
}

const LABELS: Record<string, [string, string]> = {
  base_url: ["API address", "https://…"], agent_name: ["Agent name or ID", ""], agent_password: ["Agent password", ""],
  secret_key: ["Secret key", ""], app_id: ["App ID", ""],
};
const HINTS: Record<string, string> = {
  external: "Game Vault and platforms with /api/external/addUser. Address is the host, like https://agent.gamevault.com. For Game Vault, tick UPPERCASE token and 13-digit timestamp.",
  agentserver: "Cash Machine, Mafia, Game Room. Address is https://agentserver.<host>. Use the store login.",
  ashx: "Fire Kirin, Lucky Strike and games from the same vendor. Address is https://<host>:<port> or the full …/ws/service.ashx. Whole-dollar loads only.",
  fastapi: "FastApi platforms. Fill in App ID and Secret key from the vendor, or the agent login and we fetch them.",
  manual: "No API: players' loads and cash outs wait for staff.",
};

const schema = z.object({
  name: z.string().trim().min(1, "Give the platform a name."),
  kind: z.string().min(1),
  base_url: z.string().trim(), agent_name: z.string().trim(), agent_password: z.string(), secret_key: z.string(), app_id: z.string().trim(),
  token_upper: z.boolean(), ms_timestamp: z.boolean(), use_doh: z.boolean(), is_active: z.boolean(),
  account_prefix: z.string().trim().max(8, "8 characters at most."),
  force_ip: z.string().trim().refine((v) => !v || /^\d{1,3}(\.\d{1,3}){3}$/.test(v), "Use an IPv4 address, like 203.0.113.7."),
  proxy_url: z.string().trim().refine((v) => !v || /^(https?|socks5h?):\/\/\S+$/.test(v), "Start with http://, https:// or socks5://"),
}).superRefine((v, ctx) => {
  if (v.kind !== "manual" && !v.base_url) ctx.addIssue({ code: "custom", path: ["base_url"], message: "The API address is required." });
  if (v.base_url && !/^https?:\/\/\S+$/.test(v.base_url)) ctx.addIssue({ code: "custom", path: ["base_url"], message: "Use a full address starting with https://" });
});
type Values = z.infer<typeof schema>;
const EMPTY: Values = { name: "", kind: "external", base_url: "", agent_name: "", agent_password: "", secret_key: "", app_id: "",
  token_upper: false, ms_timestamp: false, account_prefix: "", use_doh: false, force_ip: "", proxy_url: "", is_active: true };

function ProviderDialog({ initial, kinds, onClose, onSaved }: { initial: Provider | null; kinds: Kind[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial
    ? { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (initial as unknown as Record<string, unknown>)[k] ?? EMPTY[k as keyof Values]])), agent_password: "", secret_key: "", force_ip: initial.force_ip || "" } as Values
    : EMPTY });
  const { errors, isSubmitting } = form.formState;
  const kindVal = form.watch("kind");
  const fields = kinds.find((k) => k.value === kindVal)?.fields || [];

  async function save(v: Values) {
    const body: Record<string, unknown> = { ...v, force_ip: v.force_ip || null };
    if (initial) { if (!v.agent_password) delete body.agent_password; if (!v.secret_key) delete body.secret_key; }
    try {
      await apiFetch(initial ? `/game-providers/${initial.id}/` : "/game-providers/", { method: initial ? "PATCH" : "POST", token, body });
      toast.success(initial ? `${v.name} saved` : `${v.name} connected`); onSaved();
    } catch (e) {
      const fe = fieldErrors(e);
      Object.entries(fe).forEach(([k, m]) => form.setError(k as keyof Values, { message: m }));
      if (!Object.keys(fe).length) form.setError("root", { message: errorText(e) });
    }
  }
  const check = (name: "token_upper" | "ms_timestamp" | "use_doh" | "is_active", label: string) => (
    <Controller control={form.control} name={name} render={({ field }) => (
      <Field orientation="horizontal"><Checkbox id={`gp-${name}`} checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
        <FieldLabel htmlFor={`gp-${name}`} className="font-normal">{label}</FieldLabel></Field>
    )} />
  );
  const text = (name: keyof Values, label: string, opts: { placeholder?: string; full?: boolean; help?: string; secret?: boolean; maxLength?: number } = {}) => (
    <Field data-invalid={!!errors[name]} className={opts.full ? "sm:col-span-2" : undefined}>
      <FieldLabel htmlFor={`gp-${name}`}>{label}</FieldLabel>
      {opts.secret
        ? <PasswordInput id={`gp-${name}`} autoComplete="new-password" placeholder={opts.placeholder} aria-invalid={!!errors[name]} {...form.register(name)} />
        : <Input id={`gp-${name}`} autoComplete="off" placeholder={opts.placeholder} maxLength={opts.maxLength} aria-invalid={!!errors[name]} {...form.register(name)} />}
      {opts.help && <FieldDescription>{opts.help}</FieldDescription>}
      <FieldError>{errors[name]?.message as string}</FieldError>
    </Field>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{initial ? `Edit ${initial.name}` : "Connect a game platform"}</DialogTitle>
          <DialogDescription>{HINTS[kindVal]}</DialogDescription></DialogHeader>
        <form noValidate onSubmit={form.handleSubmit(save)} className="grid gap-6">
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            {text("name", "Name", { placeholder: "e.g. Fire Kirin" })}
            <Controller control={form.control} name="kind" render={({ field }) => (
              <Field><FieldLabel htmlFor="gp-kind">Type</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="gp-kind" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{kinds.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent></Select></Field>
            )} />
            {fields.filter((k) => LABELS[k]).map((k) => {
              const secret = k === "agent_password" || k === "secret_key";
              const saved = (k === "agent_password" && initial?.has_password) || (k === "secret_key" && initial?.has_secret);
              return <div key={k} className={k === "base_url" ? "sm:col-span-2" : undefined}>
                {text(k as keyof Values, LABELS[k][0], { placeholder: LABELS[k][1], secret, help: saved ? "Saved. Leave empty to keep it." : undefined })}</div>;
            })}
            {fields.includes("token_upper") && check("token_upper", "UPPERCASE token")}
            {fields.includes("ms_timestamp") && check("ms_timestamp", "13-digit (ms) timestamp")}
            {kindVal !== "manual" && <>
              {text("proxy_url", "US proxy (optional)", { full: true, placeholder: "http://user:pass@host:8080 or socks5://user:pass@host:1080",
                help: "For platforms that only accept whitelisted US IPs. Use a proxy with a fixed US IP and whitelist that IP with the vendor." })}
              {text("account_prefix", "Account name prefix", { placeholder: "optional, e.g. rs", maxLength: 8 })}
              {text("force_ip", "Pin host to IP", { placeholder: "optional" })}
              {check("use_doh", "Secure DNS (if the host is blocked)")}
            </>}
            {check("is_active", "Active")}
          </FieldGroup>
          {errors.root && <Alert variant="destructive"><AlertDescription>{errors.root.message}</AlertDescription></Alert>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Spinner />}{isSubmitting ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function status(p: Provider): [Tone, string] {
  if (!p.is_active) return ["neutral", "Off"];
  if (p.last_error) return ["bad", "Error"];
  return p.last_checked ? ["ok", "Connected"] : ["wait", "Not tested"];
}

export default function GameApis() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Provider[] | null>(null);
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [edit, setEdit] = useState<Provider | "new" | null>(null);
  const [removing, setRemoving] = useState<Provider | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [result, setResult] = useState<Record<number, { ok: boolean; text: string }>>({});

  const load = useCallback(() => { apiFetch<Provider[]>("/game-providers/", { token }).then(setRows).catch((e) => { toast.error(errorText(e)); setRows([]); }); }, [token]);
  useEffect(() => { if (!token) return; load(); apiFetch<Kind[]>("/game-providers/kinds/", { token }).then(setKinds).catch(() => {}); }, [load, token]);

  async function test(p: Provider) {
    setTesting(p.id);
    try {
      const r = await apiFetch<{ egress_ip: string; agent_balance: string | null }>(`/game-providers/${p.id}/test/`, { method: "POST", token });
      setResult((x) => ({ ...x, [p.id]: { ok: true, text: `Connected from IP ${r.egress_ip} · agent balance ${r.agent_balance ?? "—"}` } }));
    } catch (e) { setResult((x) => ({ ...x, [p.id]: { ok: false, text: errorText(e) } })); }
    finally { setTesting(null); load(); }
  }
  async function remove(p: Provider) {
    try { await apiFetch(`/game-providers/${p.id}/`, { method: "DELETE", token }); toast.success(`${p.name} removed`); load(); }
    catch (e) { toast.error(errorText(e)); }
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="Game APIs" description="Connect each game platform once. Then pick it on the game (Games → edit) and players can create accounts and load themselves."
        actions={<Button onClick={() => setEdit("new")} disabled={!kinds.length}><Plus aria-hidden />Connect platform</Button>} />
      {rows === null ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56" />)}</div> : rows.length === 0 ? (
        <Empty className="glass border"><EmptyHeader><EmptyMedia variant="icon"><Layers aria-hidden /></EmptyMedia><EmptyTitle>No platforms connected</EmptyTitle>
          <EmptyDescription>Add Fire Kirin, Game Vault, Cash Machine and others with the agent details from each vendor.</EmptyDescription></EmptyHeader>
          <Button onClick={() => setEdit("new")} disabled={!kinds.length}><Plus aria-hidden />Connect platform</Button></Empty>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const [tone, label] = status(p);
            const res = result[p.id];
            return (
              <li key={p.id}><Card className="glass h-full">
                <CardHeader className="flex flex-row items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-brand-text"><Layers className="size-5" aria-hidden /></span>
                  <div className="grid min-w-0 flex-1"><h2 className="truncate text-base">{p.name}</h2><span className="truncate text-sm text-muted-foreground">{p.kind_label.split(" — ")[0].split(" (")[0]}</span></div>
                  <StatusBadge tone={tone}>{label}</StatusBadge>
                </CardHeader>
                <CardContent className="grid flex-1 content-start gap-3">
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Agent balance</dt><dd className="font-semibold tabular-nums">{p.last_agent_balance || "—"}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Games</dt><dd className="font-semibold tabular-nums">{p.game_count}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Calls from IP</dt><dd className="truncate font-semibold">{p.last_egress_ip || "—"}{p.proxy_url ? " · proxy" : ""}</dd></div>
                  </dl>
                  <p className="truncate font-mono text-xs text-muted-foreground">{p.base_url || "—"}</p>
                  {(res || p.last_error) && <Alert variant={res?.ok ? "default" : "destructive"} role="status"><AlertDescription className="break-words">{res?.text || p.last_error}</AlertDescription></Alert>}
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  {p.kind !== "manual" && <Button variant="secondary" size="sm" disabled={testing === p.id} onClick={() => test(p)}>{testing === p.id ? <Spinner /> : <Plug aria-hidden />}{testing === p.id ? "Testing…" : "Test connection"}</Button>}
                  <Button variant="ghost" size="sm" onClick={() => setEdit(p)}><Pencil aria-hidden />Edit</Button>
                  <Button variant="ghost" size="icon-sm" className="ml-auto text-destructive-text hover:text-destructive-text" onClick={() => setRemoving(p)} aria-label={`Remove ${p.name}`}><Trash2 aria-hidden /></Button>
                </CardFooter>
              </Card></li>
            );
          })}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">Each site&apos;s server IP must be whitelisted with the vendor. Next: <Link className="font-medium text-brand-text underline-offset-4 hover:underline" href="/admin/games">link games to these platforms</Link> and set up payments in <Link className="font-medium text-brand-text underline-offset-4 hover:underline" href="/admin/deposits">Deposits</Link>.</p>
      {edit && kinds.length > 0 && <ProviderDialog initial={edit === "new" ? null : edit} kinds={kinds} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Its {removing?.game_count} game{removing?.game_count === 1 ? "" : "s"} will switch to manual loading. You can connect it again later.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => removing && remove(removing)}>Remove</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
