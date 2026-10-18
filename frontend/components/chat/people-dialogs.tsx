"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, CheckCircle2, Flag, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { lastSeenLabel, UserAvatar } from "@/components/common/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ChatMessage, Role } from "@/lib/types";
import { ROLE_LABEL } from "./people-picker";

interface Profile { id: number; username: string; full_name: string; role: Role; avatar: string | null; online: boolean; last_seen: string | null;
  bio: string; is_staff: boolean; vip_tier?: string; date_joined: string; blocked: boolean }
export interface ReportTarget { id: number; username: string; full_name?: string; role: Role | string }

export function ProfileDialog({ userId, onClose, onMessage, onReport, onBlockChange }:
  { userId: number; onClose: () => void; onMessage: ((p: Profile) => void) | null; onReport: (p: ReportTarget) => void; onBlockChange: () => void }) {
  const { token, user: me } = useAuth();
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch<Profile>(`/messenger/people/${userId}/`, { token }).then(setP).catch((e) => setError(errorText(e))); }, [userId, token]);

  async function toggleBlock() {
    if (!p) return;
    setBusy(true); setError("");
    try {
      if (p.blocked) await apiFetch(`/messenger/blocks/${p.id}/`, { method: "DELETE", token });
      else await apiFetch("/messenger/blocks/", { method: "POST", token, body: { user: p.id } });
      setP({ ...p, blocked: !p.blocked }); onBlockChange();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="sr-only"><DialogTitle>Profile</DialogTitle><DialogDescription>Details about this person</DialogDescription></DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive-text">{error}</p>}
        {!p ? <Skeleton className="h-56" /> : (
          <div className="grid justify-items-center gap-2 text-center">
            <UserAvatar name={p.full_name || p.username} src={p.avatar} size={88} online={p.online} />
            <h2 className="text-xl">{p.full_name || p.username}</h2>
            <p className="text-muted-foreground">@{p.username}</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              <Badge variant={p.is_staff ? "default" : "secondary"}>{p.is_staff ? "Staff" : ROLE_LABEL[p.role] || p.role}</Badge>
              {p.vip_tier && <Badge variant="outline">{p.vip_tier}</Badge>}
              <Badge variant="outline">{lastSeenLabel(p.online, p.last_seen) || "Offline"}</Badge>
            </div>
            {p.bio && <p className="max-w-prose">{p.bio}</p>}
            <p className="text-sm text-muted-foreground">Joined {new Date(p.date_joined).toLocaleDateString([], { month: "long", year: "numeric" })}</p>
            {p.id !== me?.id && (
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {onMessage && !p.blocked && <Button onClick={() => onMessage(p)}><MessageCircle aria-hidden />Message</Button>}
                {!p.is_staff && <Button variant="outline" disabled={busy} onClick={toggleBlock}><Ban aria-hidden />{p.blocked ? "Unblock" : "Block"}</Button>}
                <Button variant="ghost" className="text-destructive-text hover:text-destructive-text" onClick={() => onReport(p)}><Flag aria-hidden />Report</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const REASONS = [["spam", "Spam or scam"], ["abuse", "Harassment or abuse"], ["cheating", "Cheating or fraud"], ["other", "Something else"]] as const;
const reportSchema = z.object({ reason: z.enum(["spam", "abuse", "cheating", "other"]), details: z.string().trim().max(500).optional(), block: z.boolean() });

/** Report a person (optionally a specific message) to the site's staff. */
export function ReportDialog({ person, message, onClose, onDone }:
  { person: ReportTarget; message?: ChatMessage; onClose: () => void; onDone: (blocked: boolean) => void }) {
  const { token } = useAuth();
  const [sent, setSent] = useState<boolean | null>(null);
  const name = person.full_name || person.username;
  const form = useForm<z.infer<typeof reportSchema>>({ resolver: zodResolver(reportSchema), defaultValues: { reason: "spam", details: "", block: person.role === "user" } });
  async function submit(v: z.infer<typeof reportSchema>) {
    try { await apiFetch("/messenger/reports/", { method: "POST", token, body: { user: person.id, message: message?.id, ...v } }); setSent(v.block); onDone(v.block); }
    catch (e) { form.setError("root", { message: errorText(e) }); }
  }
  const { isSubmitting, errors } = form.formState;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Report {name}</DialogTitle><DialogDescription>Staff review every report.</DialogDescription></DialogHeader>
        {sent !== null ? (
          <div className="grid justify-items-center gap-2 py-4 text-center" role="status">
            <CheckCircle2 className="size-12 text-success" aria-hidden />
            <h3 className="text-lg">Thanks for telling us</h3>
            <p className="text-muted-foreground">Staff will review it.{sent ? ` You won't get messages from ${name} any more.` : ""}</p>
            <Button className="mt-2" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <form noValidate onSubmit={form.handleSubmit(submit)}>
            <FieldGroup>
              {message?.body && <blockquote className="rounded-md border-l-4 border-destructive bg-muted p-3 text-sm">“{message.body.slice(0, 240)}”</blockquote>}
              <Controller control={form.control} name="reason" render={({ field }) => (
                <FieldSet>
                  <FieldLegend variant="label">What&apos;s wrong?</FieldLegend>
                  <RadioGroup value={field.value} onValueChange={field.onChange}>
                    {REASONS.map(([v, label]) => (
                      <Field key={v} orientation="horizontal" className="min-h-10">
                        <RadioGroupItem value={v} id={`rp-${v}`} /><FieldLabel htmlFor={`rp-${v}`} className="font-normal">{label}</FieldLabel>
                      </Field>
                    ))}
                  </RadioGroup>
                </FieldSet>
              )} />
              <Field>
                <FieldLabel htmlFor="rp-details">Anything else? <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
                <Textarea id="rp-details" rows={3} maxLength={500} {...form.register("details")} />
              </Field>
              {person.role === "user" && (
                <Controller control={form.control} name="block" render={({ field }) => (
                  <Field orientation="horizontal" className="min-h-10">
                    <Checkbox id="rp-block" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                    <FieldLabel htmlFor="rp-block" className="font-normal">Also block {name}</FieldLabel>
                  </Field>
                )} />
              )}
              {errors.root && <p role="alert" className="text-sm text-destructive-text">{errors.root.message}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="submit" variant="destructive" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={isSubmitting} aria-busy={isSubmitting}>
                  {isSubmitting ? "Sending…" : "Send report"}</Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
