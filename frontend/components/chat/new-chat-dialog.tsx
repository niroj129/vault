"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { ChoiceCards } from "@/components/play/choice-cards";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Conversation } from "@/lib/types";
import { PeoplePicker, type Person } from "./people-picker";

const groupSchema = z.object({ title: z.string().trim().max(120) });
const smsSchema = z.object({
  channel: z.enum(["sms", "whatsapp", "sendblue"]),
  phone: z.string().trim().regex(/^\+?[\d\s().-]{7,20}$/, "Enter a phone number, e.g. +1 555 201 3344."),
  title: z.string().trim().max(120).optional(),
});

export function NewChatDialog({ open, onOpenChange, smsOn, onCreated }:
  { open: boolean; onOpenChange: (o: boolean) => void; smsOn: boolean; onCreated: (c: Conversation) => void }) {
  const { token, user } = useAuth();
  const [tab, setTab] = useState("direct");
  const [picked, setPicked] = useState<Person[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const groupForm = useForm<z.infer<typeof groupSchema>>({ resolver: zodResolver(groupSchema), defaultValues: { title: "" } });
  const smsForm = useForm<z.infer<typeof smsSchema>>({ resolver: zodResolver(smsSchema), defaultValues: { channel: "sms", phone: "", title: "" } });
  // which phone channels are connected (SMS number / WhatsApp number)
  const [avail, setAvail] = useState<{ sms: boolean; whatsapp: boolean; sendblue: boolean } | null>(null);
  useEffect(() => {
    if (!open || !smsOn) return;
    apiFetch<{ sms_enabled: boolean; whatsapp_enabled: boolean; imessage_enabled: boolean }>("/messenger/unread/", { token }).then((r) => {
      setAvail({ sms: r.sms_enabled, whatsapp: r.whatsapp_enabled, sendblue: r.imessage_enabled });
      // default to the first channel that is actually connected
      const first = r.imessage_enabled ? "sendblue" : r.whatsapp_enabled ? "whatsapp" : "sms";
      if (!r.sms_enabled) smsForm.setValue("channel", first);
    }).catch(() => setAvail({ sms: true, whatsapp: false, sendblue: false }));
  }, [open, smsOn, token, smsForm]);
  const channel = smsForm.watch("channel");

  async function create(body: Record<string, unknown>) {
    setBusy(true); setError("");
    try { onCreated(await apiFetch<Conversation>("/messenger/conversations/", { method: "POST", token, body })); setPicked([]); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const toggle = (p: Person) => setPicked((cur) => (cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : [...cur, p]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>New message</DialogTitle><DialogDescription>Message anyone by @username, start a group{smsOn ? ", or message a phone" : ""}.</DialogDescription></DialogHeader>
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setError(""); }} className="gap-4">
          <TabsList className="w-full">
            <TabsTrigger value="direct" className="flex-1">Person</TabsTrigger>
            <TabsTrigger value="group" className="flex-1">Group</TabsTrigger>
            {smsOn && <TabsTrigger value="sms" className="flex-1">Text a phone</TabsTrigger>}
          </TabsList>
          {error && <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive-text">{error}</p>}
          <TabsContent value="direct"><PeoplePicker selected={[]} onToggle={(p) => void create({ kind: "direct", user: p.id })} /></TabsContent>
          <TabsContent value="group">
            <form noValidate onSubmit={groupForm.handleSubmit((v) => create({ kind: "group", title: v.title, members: picked.map((p) => p.id) }))}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="group-title">Group name</FieldLabel>
                  <Input id="group-title" maxLength={120} placeholder="e.g. VIP Lounge" {...groupForm.register("title")} />
                </Field>
                {picked.length > 0 && (
                  <ul className="flex flex-wrap gap-2" aria-label="Selected">
                    {picked.map((p) => (
                      <li key={p.id}><Badge variant="secondary" className="h-9 gap-1 pr-1 text-sm">{p.full_name || p.username}
                        <Button type="button" variant="ghost" size="icon-xs" onClick={() => toggle(p)} aria-label={`Remove ${p.username}`}><X aria-hidden /></Button></Badge></li>
                    ))}
                  </ul>
                )}
                <PeoplePicker selected={picked} onToggle={toggle} multi />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button type="submit" disabled={busy || !picked.length} aria-busy={busy}>{busy ? "Creating…" : `Create group${picked.length ? ` (${picked.length + 1})` : ""}`}</Button>
                </DialogFooter>
              </FieldGroup>
            </form>
          </TabsContent>
          {smsOn && (
            <TabsContent value="sms">
              <form noValidate onSubmit={smsForm.handleSubmit((v) => create({ kind: "sms", channel: v.channel, phone: v.phone, title: v.title }))}>
                <FieldGroup>
                  {avail && !avail.sms && !avail.whatsapp && !avail.sendblue && (
                    <Alert><AlertTitle>No phone number is connected yet</AlertTitle>
                      <AlertDescription>{user?.role === "admin" ? <>Connect Sendblue or Twilio in <Link href="/admin/phone" className="font-semibold underline underline-offset-4">Phone messaging</Link> first.</> : "Ask an admin to connect a provider in Phone messaging."}</AlertDescription></Alert>
                  )}
                  {avail && [avail.sms, avail.whatsapp, avail.sendblue].filter(Boolean).length > 1 && (
                    <Controller control={smsForm.control} name="channel" render={({ field }) => (
                      <ChoiceCards label="Send as" value={field.value} onChange={(v) => field.onChange(v)} variant="chip" className={[avail.sms, avail.whatsapp, avail.sendblue].filter(Boolean).length === 3 ? "grid-cols-3" : "grid-cols-2"}
                        choices={[...(avail.sendblue ? [{ value: "sendblue", label: "iMessage" }] : []), ...(avail.sms ? [{ value: "sms", label: "SMS" }] : []), ...(avail.whatsapp ? [{ value: "whatsapp", label: "WhatsApp" }] : [])]} />
                    )} />
                  )}
                  <Field data-invalid={!!smsForm.formState.errors.phone}>
                    <FieldLabel htmlFor="sms-phone">Phone number</FieldLabel>
                    <Input id="sms-phone" type="tel" inputMode="tel" autoComplete="tel" aria-invalid={!!smsForm.formState.errors.phone} {...smsForm.register("phone")} />
                    <FieldDescription>US numbers can be typed without +1.</FieldDescription>
                    <FieldError>{smsForm.formState.errors.phone?.message}</FieldError>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sms-name">Name <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
                    <Input id="sms-name" maxLength={120} placeholder="Who is this?" {...smsForm.register("title")} />
                    <FieldDescription>{channel === "whatsapp" ? "Goes out from your WhatsApp number. WhatsApp only lets you start a chat with an approved template; free replies work for 24 hours after they message you." : channel === "sendblue" ? "iPhones get an iMessage; Android gets RCS or SMS, all from your Sendblue line. On Sendblue's free plan they must have texted you first." : "Texts go out from your site's SMS number."} Replies land in this thread, which every admin can see.</FieldDescription>
                  </Field>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="submit" disabled={busy} aria-busy={busy}>{busy ? "Opening…" : `Open ${channel === "whatsapp" ? "WhatsApp" : channel === "sendblue" ? "iMessage" : "SMS"} thread`}</Button>
                  </DialogFooter>
                </FieldGroup>
              </form>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
