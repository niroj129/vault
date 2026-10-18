"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Pencil, Plus, QrCode, Trash2 } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { OnOff } from "@/components/admin/on-off";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorText, fieldErrors, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import type { PayMethodAdmin } from "@/lib/types";

/** BytePayout's apps. A QR method can take one over; "none" = an extra method BytePayout doesn't have (e.g. Zelle). */
export const BP_APPS = [["ecashapp", "Cash App"], ["applepay", "Apple Pay"], ["googlepay", "Google Pay"], ["chime", "Chime"], ["venmo", "Venmo"], ["paypal", "PayPal"]] as const;
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
const guessReplaces = (name: string) => BP_APPS.find(([k, l]) => norm(name).startsWith(norm(l)) || norm(name).startsWith(k))?.[0] ?? "none";

const schema = z.object({
  name: z.string().trim().min(1, "Name it, e.g. Chime.").max(60),
  replaces: z.string(),
  handle: z.string().trim().max(120),
  account_name: z.string().trim().max(80),
  instructions: z.string().max(2000),
  min_amount: z.string().refine((v) => Number(v) > 0, "Above 0."),
  max_amount: z.string().refine((v) => Number(v) > 0, "Above 0."),
  quick_amounts: z.string().regex(/^[\d.,\s]*$/, "Numbers separated by commas."),
  proof: z.enum(["required", "optional", "off"]),
  sort_order: z.string(),
  is_active: z.boolean(),
}).refine((v) => Number(v.max_amount) >= Number(v.min_amount), { message: "The maximum must be at least the minimum.", path: ["max_amount"] });
type Values = z.infer<typeof schema>;

function MethodDialog({ m, onClose, onSaved }: { m: PayMethodAdmin | null; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [qr, setQr] = useState<File | null>(null);
  const [clear, setClear] = useState(false);
  const [preview, setPreview] = useState("");
  useEffect(() => { if (!qr) { setPreview(""); return; } const u = URL.createObjectURL(qr); setPreview(u); return () => URL.revokeObjectURL(u); }, [qr]);
  const shown = clear ? "" : preview || (m?.qr ? mediaUrl(m.qr) : "");
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: {
    name: m?.name ?? "Chime", replaces: m ? m.replaces || "none" : "chime", handle: m?.handle ?? "", account_name: m?.account_name ?? "", instructions: m?.instructions ?? "",
    min_amount: String(m?.min_amount ?? 5), max_amount: String(m?.max_amount ?? 500), quick_amounts: m?.quick_amounts ?? "10,20,50,100",
    proof: m?.proof ?? "required", sort_order: String(m?.sort_order ?? 0), is_active: m?.is_active ?? true } });
  const { errors, isSubmitting } = form.formState;
  const name = form.watch("name");
  // suggest what it replaces from the name until the admin picks it themselves
  useEffect(() => { if (!form.getFieldState("replaces").isDirty && !m) form.setValue("replaces", guessReplaces(name || "")); }, [name, form, m]);

  async function save(v: Values) {
    const fd = new FormData();
    Object.entries(v).forEach(([k, val]) => fd.append(k, typeof val === "boolean" ? (val ? "true" : "false") : k === "replaces" && val === "none" ? "" : String(val)));
    if (qr) fd.append("qr", qr); else if (clear) fd.append("clear_qr", "1");
    try {
      await apiFetch(m ? `/pay-methods/${m.id}/` : "/pay-methods/", { method: m ? "PATCH" : "POST", token, body: fd });
      toast.success(`${v.name} saved`); onSaved();
    } catch (e) { const fe = fieldErrors(e); Object.entries(fe).forEach(([k, msg]) => form.setError(k as keyof Values, { message: msg })); if (!Object.keys(fe).length) form.setError("root", { message: errorText(e) }); }
  }
  const text = (k: keyof Values, label: string, opts: { type?: string; help?: string } = {}) => (
    <Field data-invalid={!!errors[k]}><FieldLabel htmlFor={`pm-${k}`}>{label}</FieldLabel>
      <Input id={`pm-${k}`} type={opts.type || "text"} inputMode={opts.type === "number" ? "decimal" : undefined} aria-invalid={!!errors[k]} {...form.register(k)} />
      {opts.help && <FieldDescription>{opts.help}</FieldDescription>}<FieldError>{errors[k]?.message}</FieldError></Field>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{m ? `Edit ${m.name}` : "Add a QR payment method"}</DialogTitle>
          <DialogDescription>Players pay this account directly, upload a screenshot and tap “I&apos;ve paid”. You check it under To check.</DialogDescription></DialogHeader>
        <form noValidate onSubmit={form.handleSubmit(save)}>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col items-center gap-4 rounded-lg bg-muted p-4 sm:col-span-2 sm:flex-row">
              <button type="button" onClick={() => fileRef.current?.click()} aria-label={shown ? "Replace QR image" : "Upload QR image"}
                className="relative grid size-32 shrink-0 place-items-center overflow-hidden rounded-lg border bg-white p-2">
                {shown ? <Image src={shown} alt="QR code" fill sizes="128px" unoptimized={!!preview} className="object-contain p-2" />
                  : <span className="grid justify-items-center gap-1 text-sm text-slate-600"><ImagePlus className="size-6" aria-hidden />Upload QR</span>}
              </button>
              <div className="grid gap-2 text-center sm:text-left">
                <b>QR code or screenshot</b>
                <p className="text-sm text-muted-foreground">Screenshot your {name || "app"}&apos;s “Receive” or “Scan to pay” screen and upload it.</p>
                <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>{shown ? "Replace" : "Choose image"}</Button>
                  {shown && <Button type="button" variant="ghost" size="sm" onClick={() => { setQr(null); setClear(true); }}>Remove</Button>}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setQr(f); setClear(false); } }} />
              </div>
            </div>
            {text("name", "Name")}
            <Controller control={form.control} name="replaces" render={({ field }) => (
              <Field><FieldLabel htmlFor="pm-replaces">Takes over from BytePayout</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="pm-replaces" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Nothing (extra method)</SelectItem>{BP_APPS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
                <FieldDescription>{field.value === "none" ? "Shows next to BytePayout's methods." : "While this is on, players pay this app to your QR. Turn it off and BytePayout takes it again."}</FieldDescription></Field>
            )} />
            {text("handle", "Your handle", { help: "$ChimeSign, phone or email players send to." })}
            {text("account_name", "Account name (shown to players)")}
            <Controller control={form.control} name="proof" render={({ field }) => (
              <Field><FieldLabel htmlFor="pm-proof">Screenshot from the player</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="pm-proof" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="required">Required</SelectItem><SelectItem value="optional">Optional</SelectItem><SelectItem value="off">Don&apos;t ask</SelectItem></SelectContent></Select></Field>
            )} />
            {text("min_amount", "Minimum ($)", { type: "number" })}
            {text("max_amount", "Maximum ($)", { type: "number" })}
            {text("quick_amounts", "Amount buttons", { help: "e.g. 10,20,50,100" })}
            {text("sort_order", "Order", { type: "number" })}
            <Field className="sm:col-span-2"><FieldLabel htmlFor="pm-instructions">Instructions for players <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
              <Textarea id="pm-instructions" rows={3} placeholder="e.g. Send as a normal payment. Don't mention games in the note." {...form.register("instructions")} /></Field>
            <Controller control={form.control} name="is_active" render={({ field }) => (
              <Field orientation="horizontal" className="min-h-10 sm:col-span-2"><Checkbox id="pm-active" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                <FieldLabel htmlFor="pm-active" className="font-normal">Players can use this method</FieldLabel></Field>
            )} />
          </FieldGroup>
          {errors.root && <p role="alert" className="mt-4 text-sm text-destructive-text">{errors.root.message}</p>}
          <DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>{isSubmitting ? "Saving…" : "Save"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The site's own payment accounts (Chime QR, Cash App…). */
export function PayMethods() {
  const { token } = useAuth();
  const [rows, setRows] = useState<PayMethodAdmin[] | null>(null);
  const [edit, setEdit] = useState<PayMethodAdmin | "new" | null>(null);
  const [deleting, setDeleting] = useState<PayMethodAdmin | null>(null);
  const [bp, setBp] = useState<{ on: string[]; connected: boolean } | null>(null);
  useEffect(() => {
    apiFetch<Record<string, unknown>>("/settings/", { token }).then((s) => setBp({
      on: String(s.bp_methods || "").split(",").map((x) => x.trim()).filter(Boolean), connected: !!s.bp_api_key })).catch(() => {});
  }, [token]);
  const load = useCallback(() => apiFetch<PayMethodAdmin[] | { results: PayMethodAdmin[] }>("/pay-methods/", { token })
    .then((r) => setRows(Array.isArray(r) ? r : r.results)).catch((e) => { toast.error(errorText(e)); setRows([]); }), [token]);
  useEffect(() => { void load(); }, [load]);
  async function remove() {
    if (!deleting) return;
    try { await apiFetch(`/pay-methods/${deleting.id}/`, { method: "DELETE", token }); toast.success(`${deleting.name} deleted`); void load(); }
    catch (e) { toast.error(errorText(e)); } finally { setDeleting(null); }
  }
  return (
    <Card className="glass">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1"><CardTitle className="text-lg"><h2>Your QR payment methods</h2></CardTitle>
          <CardDescription className="max-w-prose">Players pay these straight to you, upload a screenshot and tap “I&apos;ve paid”. You get a pop-up and check it under To check. Pick which BytePayout app each one takes over; everything else stays on BytePayout.</CardDescription></div>
        <Button onClick={() => setEdit("new")}><Plus aria-hidden />Add method</Button>
      </CardHeader>
      <CardContent className="grid gap-5">
        {rows && bp && (
          <section aria-labelledby="who-takes" className="grid gap-2">
            <h3 id="who-takes" className="text-sm font-semibold">Who takes each app right now</h3>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {BP_APPS.map(([k, l]) => {
                const mine = rows.find((m) => m.is_active && m.replaces === k);
                const via = mine ? `Your QR · ${mine.name}` : bp.on.includes(k) && bp.connected ? "BytePayout" : "Not offered";
                return (
                  <li key={k} className={`grid gap-0.5 rounded-lg border p-2.5 text-sm ${mine ? "border-primary/60 bg-primary/10" : ""}`}>
                    <b>{l}</b><span className={mine ? "text-brand-text" : "text-muted-foreground"}>{via}</span>
                  </li>
                );
              })}
            </ul>
            {!bp.connected && <p className="text-sm text-muted-foreground">BytePayout isn&apos;t connected (no API key in Settings), so only your QR methods are offered.</p>}
          </section>
        )}
        {rows === null ? <Skeleton className="h-32" /> : rows.length === 0 ? (
          <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><QrCode aria-hidden /></EmptyMedia><EmptyTitle>No QR methods yet</EmptyTitle>
            <EmptyDescription>Add your Chime (or Cash App, Zelle…) with its QR code.</EmptyDescription></EmptyHeader>
            <EmptyContent><Button onClick={() => setEdit("new")}>Add Chime</Button></EmptyContent></Empty>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {rows.map((m) => (
              <li key={m.id} className={`flex items-center gap-4 rounded-lg border bg-muted/40 p-3 ${m.is_active ? "" : "opacity-70"}`}>
                <span className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-md border bg-white">
                  {m.qr ? <Image src={mediaUrl(m.qr)} alt={`${m.name} QR`} fill sizes="80px" className="object-contain p-1" /> : <QrCode className="size-6 text-slate-500" aria-label="No QR" />}
                </span>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <b>{m.name}</b><span className="text-sm text-muted-foreground">{m.replaces ? `Replaces BytePayout's ${BP_APPS.find(([k]) => k === m.replaces)?.[1]}` : "Extra method"}</span>{m.handle && <code className="truncate font-mono text-sm">{m.handle}</code>}
                  <span className="text-sm text-muted-foreground">{money(m.min_amount)}–{money(m.max_amount)} · screenshot {m.proof === "off" ? "not asked" : m.proof}</span>
                  <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{m.deposit_count} payments<OnOff on={m.is_active} no="Hidden from players" /></span>
                </div>
                <div className="flex flex-col gap-1">
                  <Button variant="outline" size="sm" onClick={() => setEdit(m)}><Pencil aria-hidden />Edit</Button>
                  <Button variant="ghost" size="sm" className="text-destructive-text hover:text-destructive-text" onClick={() => setDeleting(m)} aria-label={`Delete ${m.name}`}><Trash2 aria-hidden /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {edit && <MethodDialog m={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load(); }} />}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Players can&apos;t pay with it any more. Past payments keep their history. To pause it instead, untick “Players can use this method”.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={remove}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
