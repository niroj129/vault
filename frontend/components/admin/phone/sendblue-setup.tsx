"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Link2, PlugZap, Send, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { PasswordInput } from "@/components/auth/password-input";
import { CopyButton } from "@/components/common/copy-button";
import { StatusBadge } from "@/components/play/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Status { account: boolean; ready: boolean; key_id: string; from: string; webhook_url: string; public_ok: boolean; local: boolean; received: number; sent: number; threads: number }
interface Check { ok: boolean; error?: string; lines?: string[] }

const schema = z.object({
  sendblue_key_id: z.string().trim(),
  sendblue_secret: z.string().trim(),
  sendblue_from: z.string().trim().refine((v) => !v || /^\+\d{8,15}$/.test(v.replace(/[\s().-]/g, "")), "Use the full number with + and country code, e.g. +15551234567."),
});
type Values = z.infer<typeof schema>;
const clean = (v: string) => v.replace(/[\s().-]/g, "");

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <section className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3" aria-labelledby={`sb-s${n}`}>
    <span className="grid size-8 place-items-center rounded-full bg-primary/15 font-bold text-brand-text tabular-nums" aria-hidden>{n}</span>
    <div className="grid gap-3"><h3 id={`sb-s${n}`} className="text-base font-semibold"><span className="sr-only">Step {n}: </span>{title}</h3>{children}</div>
  </section>
);

export function SendblueSetup() {
  const { token } = useAuth();
  const [st, setSt] = useState<Status | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState("");
  const [testTo, setTestTo] = useState("");
  const [testRes, setTestRes] = useState<{ ok: boolean; text: string; conv?: number | null } | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { sendblue_key_id: "", sendblue_secret: "", sendblue_from: "" } });
  const { errors, isSubmitting, isDirty } = form.formState;

  const load = useCallback(async () => {
    try {
      const [s, cfg] = await Promise.all([apiFetch<Status>("/admin/sendblue/", { token }), apiFetch<Record<string, unknown>>("/settings/", { token })]);
      setSt(s);
      form.reset({ sendblue_key_id: String(cfg.sendblue_key_id || ""), sendblue_secret: String(cfg.sendblue_secret || ""), sendblue_from: String(cfg.sendblue_from || "") });
    } catch (e) { toast.error(errorText(e)); }
  }, [token, form]);
  useEffect(() => { void load(); }, [load]);

  async function save(v: Values) {
    try { await apiFetch("/settings/", { method: "PUT", token, body: { ...v, sendblue_from: clean(v.sendblue_from) } }); toast.success("Saved"); await load(); }
    catch (e) { form.setError("root", { message: errorText(e) }); }
  }
  async function runCheck() {
    const v = form.getValues(); setBusy("check"); setCheck(null);
    try { setCheck(await apiFetch<Check>("/admin/sendblue/check/", { method: "POST", token, body: { key_id: v.sendblue_key_id, secret: v.sendblue_secret } })); }
    catch (e) { setCheck({ ok: false, error: errorText(e) }); } finally { setBusy(""); }
  }
  async function makeAddress() {
    setBusy("addr");
    try { await apiFetch("/admin/sendblue/", { method: "POST", token }); toast.success(st?.webhook_url ? "New address made. Update it in Sendblue." : "Address made"); await load(); }
    catch (e) { toast.error(errorText(e)); } finally { setBusy(""); }
  }
  async function connect() {
    setBusy("connect");
    try { await apiFetch("/admin/sendblue/connect/", { method: "POST", token }); toast.success("Done. Sendblue now sends incoming messages here."); }
    catch (e) { toast.error(errorText(e)); } finally { setBusy(""); }
  }
  async function sendTest() {
    setBusy("test"); setTestRes(null);
    try { const r = await apiFetch<{ status: string; conversation: number | null }>("/admin/sendblue/test/", { method: "POST", token, body: { to: testTo } }); setTestRes({ ok: true, text: `Sent (${r.status}). Check your phone.`, conv: r.conversation }); }
    catch (e) { setTestRes({ ok: false, text: errorText(e) }); } finally { setBusy(""); }
  }

  if (!st) return <Skeleton className="h-96" />;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2" aria-label="Sendblue status">
        <StatusBadge tone={st.account ? "ok" : "wait"}>{st.account ? "Sendblue keys saved" : "Sendblue not connected"}</StatusBadge>
        <StatusBadge tone={st.ready ? "ok" : "wait"}>{st.ready ? `Line ${st.from}` : "No line yet"}</StatusBadge>
        {(st.received > 0 || st.sent > 0) && <StatusBadge tone="neutral">{st.received} received · {st.sent} sent</StatusBadge>}
      </div>

      <Alert className="border-warning/60 bg-warning/10"><TriangleAlert className="text-warning" aria-hidden />
        <AlertTitle>Check Sendblue&apos;s rules before messaging players</AlertTitle>
        <AlertDescription>Sendblue&apos;s terms restrict gambling and can end an account without notice. They want customers to message only people who agreed to it, and they don&apos;t allow blasts. Ask them in writing whether your site is allowed. Use this to reply to players who contact you.</AlertDescription></Alert>

      <Card className="glass">
        <CardHeader><CardTitle className="text-lg"><h2>Sendblue: iMessage, with SMS for Android</h2></CardTitle>
          <CardDescription className="max-w-prose">iPhone users get a blue-bubble iMessage. Android users get an RCS or SMS message from the same line. Replies come back into the same Inbox thread.</CardDescription></CardHeader>
        <CardContent className="grid gap-8">
          <form id="sendblue-form" noValidate onSubmit={form.handleSubmit(save)} className="grid gap-8">
            <Step n={1} title="Your Sendblue keys">
              <p className="text-sm text-muted-foreground">In the Sendblue dashboard, open Developer → API keys. Copy the API key ID and the API secret. They stay on this site.</p>
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field><FieldLabel htmlFor="sb-key">API key ID</FieldLabel><Input id="sb-key" autoComplete="off" spellCheck={false} className="font-mono" {...form.register("sendblue_key_id")} /></Field>
                <Field><FieldLabel htmlFor="sb-secret">API secret</FieldLabel><PasswordInput id="sb-secret" autoComplete="off" {...form.register("sendblue_secret")} /></Field>
              </FieldGroup>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" disabled={!!busy} onClick={runCheck}>{busy === "check" ? <Spinner /> : <PlugZap aria-hidden />}Check connection</Button>
                <span className="text-sm text-muted-foreground">Read-only: nothing is sent.</span>
              </div>
              {check && (check.ok
                ? <Alert className="border-success/50 bg-success/10" role="status"><AlertTitle>Connected</AlertTitle><AlertDescription>{check.lines?.length ? <>Lines on your account: {check.lines.join(", ")}.</> : "No lines were listed on this account yet."}</AlertDescription></Alert>
                : <Alert variant="destructive" role="alert"><CircleAlert aria-hidden /><AlertTitle>Couldn&apos;t connect</AlertTitle><AlertDescription>{check.error}</AlertDescription></Alert>)}
            </Step>
            <Step n={2} title="Your Sendblue line">
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.sendblue_from}><FieldLabel htmlFor="sb-from">Line (the number messages come from)</FieldLabel>
                  <Input id="sb-from" type="tel" inputMode="tel" autoComplete="off" placeholder="+15551234567" aria-invalid={!!errors.sendblue_from} {...form.register("sendblue_from")} />
                  <FieldError>{errors.sendblue_from?.message}</FieldError></Field>
                {check?.lines?.length ? (
                  <Field><FieldLabel htmlFor="sb-pick">Lines on your account</FieldLabel>
                    <Select value="" onValueChange={(v) => form.setValue("sendblue_from", v, { shouldDirty: true })}>
                      <SelectTrigger id="sb-pick" className="w-full"><SelectValue placeholder="Choose one…" /></SelectTrigger>
                      <SelectContent>{check.lines.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></Field>
                ) : null}
              </FieldGroup>
            </Step>
            {errors.root && <p role="alert" className="text-sm text-destructive-text">{errors.root.message}</p>}
            <div><Button type="submit" disabled={isSubmitting || !isDirty} aria-busy={isSubmitting}>{isSubmitting && <Spinner />}{isSubmitting ? "Saving…" : "Save"}</Button></div>
          </form>

          <Step n={3} title="Receive replies">
            <p className="text-sm text-muted-foreground">Sendblue sends incoming messages and delivery updates to a private address for your site. Anyone with the address could post messages into your Inbox, so keep it private.</p>
            {st.webhook_url ? (
              <Field><FieldLabel htmlFor="sb-hook">Your webhook address</FieldLabel>
                <div className="flex gap-2"><Input id="sb-hook" readOnly value={st.webhook_url} className="font-mono text-sm" onFocus={(e) => e.currentTarget.select()} /><CopyButton value={st.webhook_url} label="webhook address" size="icon" /></div></Field>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant={st.webhook_url ? "outline" : "default"} size="sm" disabled={!!busy} onClick={makeAddress}>{busy === "addr" ? <Spinner /> : null}{st.webhook_url ? "Make a new address" : "Make my webhook address"}</Button>
              {st.webhook_url && <Button type="button" size="sm" disabled={!st.public_ok || !!busy} onClick={connect}>{busy === "connect" ? <Spinner /> : <Link2 aria-hidden />}Register it with Sendblue</Button>}
            </div>
            {st.webhook_url && <p className="text-sm text-muted-foreground">{st.public_ok ? "Or paste it yourself in Sendblue: Developer → Webhooks → type “receive”." : <>Works once the site is on its real https domain. Sendblue can&apos;t reach {st.local ? "a computer on your desk" : "this address"}. You can also paste it in Sendblue&apos;s dashboard (Developer → Webhooks, type “receive”) later.</>}</p>}
          </Step>

          <Step n={4} title="Send yourself a test">
            <p className="text-sm text-muted-foreground">Sends one real message. On Sendblue&apos;s free plan, add the person as a contact first and have them text your line once, because it only lets you reply to people who contacted you.</p>
            <div className="flex flex-wrap items-end gap-3">
              <Field className="min-w-48 flex-1"><FieldLabel htmlFor="sb-to">Send to</FieldLabel>
                <Input id="sb-to" type="tel" inputMode="tel" autoComplete="off" placeholder="+15551234567" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></Field>
              <Button type="button" disabled={!testTo.trim() || !!busy || !st.ready} onClick={sendTest}>{busy === "test" ? <Spinner /> : <Send aria-hidden />}Send test</Button>
            </div>
            {testRes && (
              <div className="flex flex-wrap items-center gap-3">
                <p role={testRes.ok ? "status" : "alert"} className={testRes.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-destructive-text"}>{testRes.text}</p>
                {testRes.ok && testRes.conv && <Button asChild size="sm" variant="outline"><Link href={`/admin/messages?c=${testRes.conv}`}>Open the chat in Messages</Link></Button>}
              </div>
            )}
          </Step>
        </CardContent>
      </Card>
    </div>
  );
}
