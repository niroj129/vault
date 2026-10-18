"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, ExternalLink, Link2, Phone, PlugZap, Send } from "lucide-react";
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

interface Status {
  account: boolean; sms: boolean; whatsapp: boolean; sid: string; sms_from: string; whatsapp_from: string;
  webhook_url: string; public_ok: boolean; local: boolean; received: number; sent: number; threads: { sms: number; whatsapp: number };
}
interface Check { ok: boolean; error?: string; name?: string; status?: string; type?: string; numbers?: { sid: string; number: string; name: string; sms: boolean; sms_url: string }[] }

const SANDBOX = "+14155238886";
const phone = z.string().trim().refine((v) => !v || /^\+\d{8,15}$/.test(v.replace(/[\s().-]/g, "")), "Use the full number with + and country code, e.g. +15551234567.");
const schema = z.object({
  twilio_sid: z.string().trim().refine((v) => !v || /^AC[0-9a-f]{32}$/i.test(v), "An Account SID starts with AC and has 34 characters."),
  twilio_token: z.string().trim().refine((v) => !v || v.length >= 20, "That looks too short for an Auth Token."),
  twilio_from: phone, twilio_whatsapp_from: phone,
});
type Values = z.infer<typeof schema>;
const clean = (v: string) => v.replace(/[\s().-]/g, "");

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <section className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3" aria-labelledby={`ph-s${n}`}>
    <span className="grid size-8 place-items-center rounded-full bg-primary/15 font-bold text-brand-text tabular-nums" aria-hidden>{n}</span>
    <div className="grid gap-3"><h3 id={`ph-s${n}`} className="text-base font-semibold"><span className="sr-only">Step {n}: </span>{title}</h3>{children}</div>
  </section>
);

export function TwilioSetup() {
  const { token } = useAuth();
  const [st, setSt] = useState<Status | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState("");
  const [testCh, setTestCh] = useState("sms");
  const [testTo, setTestTo] = useState("");
  const [testRes, setTestRes] = useState<{ ok: boolean; text: string; conv?: number | null } | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { twilio_sid: "", twilio_token: "", twilio_from: "", twilio_whatsapp_from: "" } });
  const { errors, isSubmitting, isDirty } = form.formState;

  const load = useCallback(async () => {
    try {
      const [s, cfg] = await Promise.all([apiFetch<Status>("/admin/twilio/", { token }), apiFetch<Record<string, unknown>>("/settings/", { token })]);
      setSt(s);
      form.reset({ twilio_sid: String(cfg.twilio_sid || ""), twilio_token: String(cfg.twilio_token || ""), twilio_from: String(cfg.twilio_from || ""), twilio_whatsapp_from: String(cfg.twilio_whatsapp_from || "") });
    } catch (e) { toast.error(errorText(e)); }
  }, [token, form]);
  useEffect(() => { void load(); }, [load]);

  async function save(v: Values) {
    try {
      await apiFetch("/settings/", { method: "PUT", token, body: { ...v, twilio_from: clean(v.twilio_from), twilio_whatsapp_from: clean(v.twilio_whatsapp_from) } });
      toast.success("Saved"); await load();
    } catch (e) { form.setError("root", { message: errorText(e) }); }
  }
  async function runCheck() {
    const v = form.getValues();
    setBusy("check"); setCheck(null);
    try { setCheck(await apiFetch<Check>("/admin/twilio/check/", { method: "POST", token, body: { sid: v.twilio_sid, token: v.twilio_token } })); }
    catch (e) { setCheck({ ok: false, error: errorText(e) }); } finally { setBusy(""); }
  }
  async function connect(sid: string) {
    setBusy(`c${sid}`);
    try { await apiFetch("/admin/twilio/connect-number/", { method: "POST", token, body: { number_sid: sid } }); toast.success("Done. Texts to that number now arrive in your inbox."); await runCheck(); }
    catch (e) { toast.error(errorText(e)); } finally { setBusy(""); }
  }
  async function sendTest() {
    setBusy("test"); setTestRes(null);
    try { const r = await apiFetch<{ status: string; conversation: number | null }>("/admin/twilio/test/", { method: "POST", token, body: { channel: testCh, to: testTo } }); setTestRes({ ok: true, text: `Sent (${r.status}). Check your phone.`, conv: r.conversation }); }
    catch (e) { setTestRes({ ok: false, text: errorText(e) }); } finally { setBusy(""); }
  }

  if (!st) return <div className="grid gap-4"><Skeleton className="h-16" /><Skeleton className="h-96" /></div>;
  const smsFrom = clean(form.watch("twilio_from") || "");
  const mine = check?.numbers?.find((n) => n.number === smsFrom);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2" aria-label="Connection status">
        <StatusBadge tone={st.account ? "ok" : "wait"}>{st.account ? "Twilio account saved" : "Twilio not connected"}</StatusBadge>
        <StatusBadge tone={st.sms ? "ok" : "wait"}>{st.sms ? `SMS from ${st.sms_from}` : "No SMS number"}</StatusBadge>
        <StatusBadge tone={st.whatsapp ? "ok" : "wait"}>{st.whatsapp ? `WhatsApp from ${st.whatsapp_from}` : "No WhatsApp number"}</StatusBadge>
        {(st.received > 0 || st.sent > 0) && <StatusBadge tone="neutral">{st.received} received · {st.sent} sent</StatusBadge>}
      </div>

      <Card className="glass">
        <CardHeader><CardTitle className="text-lg"><h2>Twilio: SMS and WhatsApp</h2></CardTitle>
          <CardDescription className="max-w-prose">Type your details from the Twilio console. They stay on this site. Never send them to anyone.</CardDescription></CardHeader>
        <CardContent className="grid gap-8">
          <form id="twilio-form" noValidate onSubmit={form.handleSubmit(save)} className="grid gap-8">
            <Step n={1} title="Your Twilio account">
              <p className="text-sm text-muted-foreground">In the Twilio console, open Account → API keys &amp; tokens. Copy the Account SID and Auth Token.</p>
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.twilio_sid}><FieldLabel htmlFor="tw-sid">Account SID</FieldLabel>
                  <Input id="tw-sid" autoComplete="off" spellCheck={false} placeholder="AC…" className="font-mono" aria-invalid={!!errors.twilio_sid} {...form.register("twilio_sid")} />
                  <FieldError>{errors.twilio_sid?.message}</FieldError></Field>
                <Field data-invalid={!!errors.twilio_token}><FieldLabel htmlFor="tw-token">Auth Token</FieldLabel>
                  <PasswordInput id="tw-token" autoComplete="off" aria-invalid={!!errors.twilio_token} {...form.register("twilio_token")} />
                  <FieldError>{errors.twilio_token?.message}</FieldError></Field>
              </FieldGroup>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" disabled={!!busy} onClick={runCheck}>{busy === "check" ? <Spinner /> : <PlugZap aria-hidden />}Check connection</Button>
                <span className="text-sm text-muted-foreground">Read-only: nothing is sent or changed.</span>
              </div>
              {check && (check.ok
                ? <Alert className="border-success/50 bg-success/10" role="status"><AlertTitle>Connected to “{check.name}”</AlertTitle><AlertDescription>Account is {check.status}{check.type ? ` (${check.type})` : ""}. {check.status !== "active" ? "A suspended or closed account can't send." : ""}{check.type === "Trial" ? " Trial accounts can only message numbers you've verified in Twilio." : ""}</AlertDescription></Alert>
                : <Alert variant="destructive" role="alert"><CircleAlert aria-hidden /><AlertTitle>Couldn&apos;t connect</AlertTitle><AlertDescription>{check.error}</AlertDescription></Alert>)}
            </Step>

            <Step n={2} title="Your phone number (SMS)">
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.twilio_from}><FieldLabel htmlFor="tw-from">Twilio phone number</FieldLabel>
                  <Input id="tw-from" type="tel" inputMode="tel" autoComplete="off" placeholder="+15551234567" aria-invalid={!!errors.twilio_from} {...form.register("twilio_from")} />
                  <FieldDescription>Texts go out from this number. Run the check above to pick from your account&apos;s numbers.</FieldDescription>
                  <FieldError>{errors.twilio_from?.message}</FieldError></Field>
                {check?.numbers?.length ? (
                  <Field><FieldLabel htmlFor="tw-pick">Numbers on your account</FieldLabel>
                    <Select value="" onValueChange={(v) => form.setValue("twilio_from", v, { shouldDirty: true })}>
                      <SelectTrigger id="tw-pick" className="w-full"><SelectValue placeholder="Choose one…" /></SelectTrigger>
                      <SelectContent>{check.numbers.map((n) => <SelectItem key={n.sid} value={n.number}>{n.number}{n.name && n.name !== n.number ? ` · ${n.name}` : ""}</SelectItem>)}</SelectContent></Select></Field>
                ) : null}
              </FieldGroup>
              {mine && (
                <div className="grid gap-2 rounded-lg border p-3 text-sm">
                  <p>{mine.sms_url === st.webhook_url ? <><b className="text-success">Replies already come here.</b> This number&apos;s incoming-text address is this site.</>
                    : <>When someone texts <b>{mine.number}</b>, Twilio needs to know to send it to this site.{mine.sms_url ? <> It currently points to <code className="font-mono break-all">{mine.sms_url}</code>.</> : null}</>}</p>
                  {mine.sms_url !== st.webhook_url && <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" disabled={!st.public_ok || !!busy} onClick={() => connect(mine.sid)}>{busy === `c${mine.sid}` ? <Spinner /> : <Link2 aria-hidden />}Point this number at my site</Button>
                    {!st.public_ok && <span className="text-muted-foreground">Works once the site is on its real https domain. Twilio can&apos;t reach {st.local ? "a computer on your desk" : "this address"}.</span>}
                  </div>}
                </div>
              )}
              <Field><FieldLabel htmlFor="tw-hook">Address for incoming texts and WhatsApp messages</FieldLabel>
                <div className="flex gap-2"><Input id="tw-hook" readOnly value={st.webhook_url} className="font-mono text-sm" onFocus={(e) => e.currentTarget.select()} /><CopyButton value={st.webhook_url} label="webhook address" size="icon" /></div>
                <FieldDescription>Twilio console → Phone Numbers → your number → Messaging → “A message comes in” → Webhook, HTTP POST. Paste this. (The button above does it for you.)</FieldDescription></Field>
            </Step>

            <Step n={3} title="WhatsApp">
              <Field data-invalid={!!errors.twilio_whatsapp_from}><FieldLabel htmlFor="tw-wa">WhatsApp number</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  <Input id="tw-wa" type="tel" inputMode="tel" autoComplete="off" placeholder="+14155238886" className="min-w-0 flex-1" aria-invalid={!!errors.twilio_whatsapp_from} {...form.register("twilio_whatsapp_from")} />
                  <Button type="button" variant="outline" onClick={() => form.setValue("twilio_whatsapp_from", SANDBOX, { shouldDirty: true })}>Use the sandbox number</Button>
                </div>
                <FieldDescription>For testing, Twilio&apos;s sandbox number is {SANDBOX}. For real customers, use your own WhatsApp-approved number.</FieldDescription>
                <FieldError>{errors.twilio_whatsapp_from?.message}</FieldError></Field>
              <ol className="grid list-decimal gap-1.5 pl-5 text-sm">
                <li><b>Sandbox (to try it now):</b> Twilio console → Messaging → Try it out → Send a WhatsApp message. Each person you want to message first sends the join code (like <code className="font-mono">join word-word</code>) to the sandbox number from their WhatsApp.</li>
                <li>On that sandbox page, set <b>When a message comes in</b> to the address above.</li>
                <li><b>Real use:</b> register your number as a WhatsApp sender (Twilio console → Messaging → Senders → WhatsApp senders). Meta reviews your business, which can take days.</li>
              </ol>
              <Alert><AlertTitle>The 24-hour rule</AlertTitle><AlertDescription>WhatsApp lets you reply freely for 24 hours after a person&apos;s last message. To start a chat, or after 24 hours, only a pre-approved template message works. If a message is refused, the thread says so.</AlertDescription></Alert>
            </Step>
            {errors.root && <p role="alert" className="text-sm text-destructive-text">{errors.root.message}</p>}
            <div><Button type="submit" disabled={isSubmitting || !isDirty} aria-busy={isSubmitting}>{isSubmitting && <Spinner />}{isSubmitting ? "Saving…" : "Save"}</Button></div>
          </form>

          <Step n={4} title="Send yourself a test">
            <p className="text-sm text-muted-foreground">Sends one real message to the number you type, so it costs a message. Save above first.</p>
            <div className="flex flex-wrap items-end gap-3">
              <Field className="w-40"><FieldLabel htmlFor="tw-tch">Channel</FieldLabel>
                <Select value={testCh} onValueChange={setTestCh}><SelectTrigger id="tw-tch" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="sms" disabled={!st.sms}>SMS</SelectItem><SelectItem value="whatsapp" disabled={!st.whatsapp}>WhatsApp</SelectItem></SelectContent></Select></Field>
              <Field className="min-w-48 flex-1"><FieldLabel htmlFor="tw-to">Send to</FieldLabel>
                <Input id="tw-to" type="tel" inputMode="tel" autoComplete="off" placeholder="+15551234567" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></Field>
              <Button type="button" disabled={!testTo.trim() || !!busy || !(testCh === "sms" ? st.sms : st.whatsapp)} onClick={sendTest}>{busy === "test" ? <Spinner /> : <Send aria-hidden />}Send test</Button>
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

      <Card className="glass">
        <CardHeader><CardTitle className="text-lg"><h2>Using it</h2></CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p>Open the <Link href="/admin/messages" className="font-semibold text-brand-text underline-offset-4 hover:underline">Inbox</Link>, click <b>New</b>, then <b>Text a phone</b> and choose SMS or WhatsApp. Replies appear in the same thread for every admin. {st.threads.sms + st.threads.whatsapp > 0 && <>You have {st.threads.sms} SMS and {st.threads.whatsapp} WhatsApp thread{st.threads.sms + st.threads.whatsapp === 1 ? "" : "s"} so far.</>}</p>
          <p className="flex items-center gap-2 text-muted-foreground"><Phone className="size-4" aria-hidden />Each message is billed by Twilio (SMS in segments of 160 characters). Check your Twilio pricing.</p>
          <Button asChild variant="outline" size="sm" className="w-fit"><a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden />Open the Twilio console</a></Button>
        </CardContent>
      </Card>
    </div>
  );
}
