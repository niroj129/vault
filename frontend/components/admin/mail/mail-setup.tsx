"use client";

import { ExternalLink, Mail, RefreshCw, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/auth/password-input";
import { CopyButton } from "@/components/common/copy-button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago } from "@/lib/format";

interface Setup { url: string; mailgun_signing_key_set: boolean; last_received_at: string | null; total: number;
  gmail_confirm: { code: string; link: string; received_at: string } | null }

/** Only payment emails get forwarded, never the whole inbox. */
const GMAIL_FILTER = "from:(square.com OR cash.app OR chime.com OR venmo.com OR paypal.com OR zellepay.com)";

const PROVIDERS = [
  { id: "postmark", name: "Postmark", note: "Recommended. No domain setup; free for 100 emails a month.", steps: [
    "Create a free account at postmarkapp.com and a Server.",
    "Open the server's Default Inbound Stream → Settings.",
    "Paste the webhook address above into Inbound webhook URL and save.",
    "Copy the inbound email address Postmark shows (something@inbound.postmarkapp.com). You'll forward to it from Gmail.",
  ] },
  { id: "cloudmailin", name: "CloudMailin", note: "Also no domain setup. Free tier for testing.", steps: [
    "Create an account at cloudmailin.com.",
    "Set the Target to the webhook address above and the format to JSON (Normalized).",
    "Copy your CloudMailin address (something@cloudmailin.net) to forward to.",
  ] },
  { id: "mailgun", name: "Mailgun", note: "Needs DNS records on a subdomain you own (e.g. mail.yoursite.com).", steps: [
    "Add a receiving domain in Mailgun and set its MX records.",
    "Receiving → Create route: match recipient pay@mail.yoursite.com, forward to the webhook address above.",
    "Paste Mailgun's HTTP webhook signing key below, so the site checks every post really came from Mailgun.",
  ] },
  { id: "sendgrid", name: "SendGrid", note: "Needs DNS records on a subdomain you own.", steps: [
    "Point an MX record for a subdomain to mx.sendgrid.net.",
    "Settings → Inbound Parse → Add host & URL: your subdomain and the webhook address above. Leave raw mode off.",
  ] },
] as const;

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
    <span className="grid size-8 place-items-center rounded-full bg-primary/15 font-bold text-brand-text tabular-nums" aria-hidden>{n}</span>
    <div className="grid gap-2"><h3 className="text-base font-semibold"><span className="sr-only">Step {n}: </span>{title}</h3>{children}</div>
  </li>
);

export function MailSetup({ onSample }: { onSample: () => void }) {
  const { token } = useAuth();
  const [s, setS] = useState<Setup | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState("");
  const [regen, setRegen] = useState(false);
  const load = useCallback(() => apiFetch<Setup>("/admin/mail/setup/", { token }).then(setS).catch((e) => toast.error(errorText(e))), [token]);
  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>, done: string) {
    setBusy(String(body.action || "key"));
    try { setS(await apiFetch<Setup>("/admin/mail/setup/", { method: "POST", token, body })); toast.success(done); }
    catch (e) { toast.error(errorText(e)); } finally { setBusy(""); }
  }
  async function sample() {
    if (!s?.url) return;
    setBusy("sample");
    try {
      const path = new URL(s.url).pathname.replace(/^\/api/, ""); // apiFetch adds /api
      await apiFetch(path, { method: "POST", body: { FromFull: { Email: "cash@square.com", Name: "Cash App" }, Subject: "[Sample] Test Player sent you $1.00",
        TextBody: "This is a sample payment email sent from the setup page.", MessageID: `sample-${Date.now()}` } });
      toast.success("Sample email received", { description: "It's in the list with No match. Archive it when you're done." }); onSample(); void load();
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(""); }
  }

  if (!s) return <Skeleton className="h-96" />;
  return (
    <div className="grid gap-6">
      {s.gmail_confirm && (
        <Alert className="border-info/50 bg-info/10">
          <Mail className="text-info" aria-hidden />
          <AlertTitle>Gmail sent a forwarding code {ago(s.gmail_confirm.received_at)}</AlertTitle>
          <AlertDescription className="grid gap-2">
            <span className="flex flex-wrap items-center gap-2">Enter this code in Gmail&apos;s Forwarding settings:
              <code className="rounded bg-muted px-2 py-1 font-mono text-base font-bold text-foreground">{s.gmail_confirm.code || "—"}</code>
              {s.gmail_confirm.code && <CopyButton value={s.gmail_confirm.code} label="Gmail code" />}</span>
            {s.gmail_confirm.link && <Button asChild size="sm" variant="outline" className="w-fit"><a href={s.gmail_confirm.link} target="_blank" rel="noopener noreferrer">Or confirm with Google&apos;s link<ExternalLink aria-hidden /></a></Button>}
          </AlertDescription>
        </Alert>
      )}
      <Card className="glass">
        <CardHeader><CardTitle className="text-lg"><h2>Set up email forwarding</h2></CardTitle>
          <CardDescription className="max-w-prose">Your payment apps email you when money arrives. Forward those emails here and each one is matched to the player&apos;s QR payment as evidence. Staff still approve every payment; an email never approves anything by itself.</CardDescription></CardHeader>
        <CardContent>
          <ol className="grid gap-8">
            <Step n={1} title="Your site's webhook address">
              <p className="text-sm text-muted-foreground">Keep it private: anyone with it can send emails into this list.</p>
              {s.url ? (
                <div className="flex gap-2"><Input readOnly value={s.url} aria-label="Webhook address" className="font-mono text-sm" onFocus={(e) => e.currentTarget.select()} /><CopyButton value={s.url} label="webhook address" size="icon" /></div>
              ) : <Button className="w-fit" disabled={busy === "create"} onClick={() => post({ action: "create" }, "Webhook address created")}>{busy === "create" && <Spinner />}Create my webhook address</Button>}
              {s.url && <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={!!busy} onClick={sample}>{busy === "sample" ? <Spinner /> : <Send aria-hidden />}Send a sample email</Button>
                <Button variant="ghost" size="sm" onClick={() => setRegen(true)}><RefreshCw aria-hidden />Make a new address</Button>
              </div>}
              <p className="text-sm text-muted-foreground">{s.total ? `${s.total} email${s.total === 1 ? "" : "s"} received, last ${ago(s.last_received_at)}.` : "No emails received yet."}
                {" "}Forwarding only works once the site is on its real domain; the mail services can&apos;t reach a local computer.</p>
            </Step>
            <Step n={2} title="Pick an incoming-mail service and paste the address">
              <Tabs defaultValue="postmark" className="gap-3">
                <TabsList className="flex-wrap">{PROVIDERS.map((p) => <TabsTrigger key={p.id} value={p.id} className="px-3">{p.name}</TabsTrigger>)}</TabsList>
                {PROVIDERS.map((p) => (
                  <TabsContent key={p.id} value={p.id} className="grid gap-2">
                    <p className="text-sm text-muted-foreground">{p.note}</p>
                    <ol className="grid list-decimal gap-1.5 pl-5 text-sm">{p.steps.map((x) => <li key={x}>{x}</li>)}</ol>
                    {p.id === "mailgun" && (
                      <Field className="max-w-md"><FieldLabel htmlFor="mg-key">Mailgun webhook signing key</FieldLabel>
                        <div className="flex gap-2"><PasswordInput id="mg-key" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={s.mailgun_signing_key_set ? "Saved. Paste a new one to replace it" : ""} />
                          <Button variant="outline" disabled={!!busy} onClick={() => { void post({ mailgun_signing_key: key }, key ? "Signing key saved" : "Signing key removed"); setKey(""); }}>Save</Button></div>
                        <FieldDescription>{s.mailgun_signing_key_set ? "Every Mailgun post is checked against this key." : "Optional, but recommended with Mailgun."}</FieldDescription></Field>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </Step>
            <Step n={3} title="Add the forwarding address in Gmail">
              <ol className="grid list-decimal gap-1.5 pl-5 text-sm">
                <li>Gmail → Settings (gear) → See all settings → <b>Forwarding and POP/IMAP</b> → <b>Add a forwarding address</b>.</li>
                <li>Paste the service&apos;s inbound address from step 2. Gmail sends that address a confirmation code.</li>
                <li>The code shows up at the top of this page within a minute. Type it into Gmail and click Verify.</li>
                <li>Leave <b>Disable forwarding</b> selected. Step 4 forwards only payment emails.</li>
              </ol>
            </Step>
            <Step n={4} title="Forward only payment emails">
              <p className="text-sm">In Gmail&apos;s search bar, paste this, click the filter icon → <b>Create filter</b> → tick <b>Forward it to</b> the inbound address.</p>
              <div className="flex gap-2"><Input readOnly value={GMAIL_FILTER} aria-label="Gmail filter" className="font-mono text-sm" onFocus={(e) => e.currentTarget.select()} /><CopyButton value={GMAIL_FILTER} label="Gmail filter" size="icon" /></div>
              <p className="text-sm text-muted-foreground">Zelle emails come from your bank. Add your bank&apos;s address to the filter, e.g. <code className="font-mono">OR chase.com</code>.</p>
            </Step>
            <Step n={5} title="Test it">
              <p className="text-sm">Send yourself $1 from another account. The email appears under Payment emails within a minute. When a player pays your QR, their payment&apos;s check card shows the email.</p>
            </Step>
          </ol>
        </CardContent>
      </Card>
      <AlertDialog open={regen} onOpenChange={setRegen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Make a new webhook address?</AlertDialogTitle>
            <AlertDialogDescription>The old address stops working right away. Paste the new one into your mail service, or emails stop arriving.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep the old one</AlertDialogCancel>
            <AlertDialogAction onClick={() => post({ action: "regenerate" }, "New address made. Update your mail service.")}>Make a new address</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
