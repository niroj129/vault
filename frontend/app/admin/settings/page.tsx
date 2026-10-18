"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Bell, ChevronDown, ImagePlus, Layers, Pencil, Phone, Save, Scale, Search, Star, Undo2, Users, type LucideIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { PasswordInput } from "@/components/auth/password-input";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorText, fieldErrors, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { effectiveAccent, onColor } from "@/lib/brand";
import { cn } from "@/lib/utils";

type Kind = "text" | "textarea" | "image" | "color" | "toggle" | "secret" | "email" | "url";
interface F { name: string; label: string; type?: Kind; hint?: string; help?: string; placeholder?: string; full?: boolean; rows?: number }
interface Section { id: string; icon: LucideIcon; title: string; blurb: string; ep: "site" | "biz"; fields: F[]; collapsed?: boolean }
type Values = Record<string, string | boolean>;

const EP = { site: "/settings/", biz: "/business/" } as const;
const SECTIONS: Section[] = [
  { id: "brand", icon: Star, title: "Brand", blurb: "Your name, logo and colours, used across the whole site.", ep: "site", fields: [
    { name: "site_name", label: "Site name" },
    { name: "currency", label: "Currency symbol", placeholder: "$" },
    { name: "tagline", label: "Tagline", full: true },
    { name: "logo", label: "Logo", type: "image", hint: "Square PNG, at least 256×256" },
    { name: "favicon", label: "Browser icon", type: "image", hint: "Square, 64×64 or bigger" },
    { name: "social_preview", label: "Link preview image", type: "image", hint: "1200×630, shown when the site is shared", full: true },
    { name: "color_accent", label: "Main colour", type: "color", hint: "Buttons and highlights" },
    { name: "color_secondary", label: "Second colour", type: "color", hint: "Labels and links" },
    { name: "color_primary", label: "Background tint", type: "color", hint: "Night background" },
  ] },
  { id: "access", icon: Users, title: "Sign-up & access", blurb: "Who can get in, and where the “Create account” button goes.", ep: "site", fields: [
    { name: "signup_url", label: "Create-account link (optional)", type: "url", full: true, placeholder: "https://…", help: "Leave empty to use the built-in sign-up. Or send new players somewhere else, like your Telegram." },
    { name: "maintenance_mode", label: "Maintenance mode", type: "toggle", help: "Players see a “back soon” page. Staff can still sign in." },
  ] },
  { id: "alerts", icon: Bell, title: "Staff alerts (Telegram)", blurb: "Get a Telegram message for every payment to check, load to do and cash out.", ep: "site", fields: [
    { name: "telegram_bot_token", label: "Bot token", type: "secret", placeholder: "123456:ABC…" },
    { name: "telegram_chat_id", label: "Chat ID", placeholder: "-100…" },
  ] },
  { id: "contact", icon: Phone, title: "Contact & social", blurb: "Shown in the footer and on the Contact page.", ep: "biz", fields: [
    { name: "business_name", label: "Business name" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone" },
    { name: "whatsapp", label: "WhatsApp" },
    { name: "telegram", label: "Telegram link", type: "url" },
    { name: "facebook", label: "Facebook link", type: "url" },
    { name: "instagram", label: "Instagram link", type: "url" },
    { name: "address", label: "Address", full: true },
    { name: "map_embed", label: "Map embed (iframe)", type: "textarea", full: true },
  ] },
  { id: "legal", icon: Scale, title: "About & legal", blurb: "Your About, Terms and Privacy pages.", ep: "biz", fields: [
    { name: "about", label: "About", type: "textarea", rows: 4, full: true },
    { name: "terms", label: "Terms", type: "textarea", rows: 6, full: true },
    { name: "privacy", label: "Privacy", type: "textarea", rows: 6, full: true },
  ] },
  { id: "seo", icon: Search, title: "Analytics", blurb: "Google tools. More SEO options live under Marketing → SEO.", ep: "site", fields: [
    { name: "analytics_id", label: "Google Analytics ID", placeholder: "G-XXXXXXX" },
    { name: "gsc_verification", label: "Search Console verification" },
  ] },
  { id: "old", icon: Layers, title: "Old connections", blurb: "The earlier single game API. The current flow doesn't use it.", ep: "site", collapsed: true, fields: [
    { name: "game_api_url", label: "Game API base URL", type: "url", full: true },
    { name: "game_api_agent_id", label: "Game API agent ID" },
    { name: "game_api_secret", label: "Game API secret", type: "secret" },
    { name: "game_api_use_doh", label: "Use secure DNS", type: "toggle" },
    { name: "game_api_force_ip", label: "Pin API to IP" },
  ] },
];
const ALL = SECTIONS.flatMap((s) => s.fields.map((f) => ({ ...f, ep: s.ep })));
const HEX = /^#[0-9a-f]{6}$/i;

const schema = z.object(Object.fromEntries(ALL.filter((f) => f.type !== "image").map((f) => {
  if (f.type === "toggle") return [f.name, z.boolean()];
  let s = z.string().trim();
  if (f.type === "color") return [f.name, s.refine((v) => !v || HEX.test(v), "Use a 6-digit hex colour, like #7C3AED.")];
  if (f.type === "email") return [f.name, s.refine((v) => !v || z.email().safeParse(v).success, "That email doesn't look right.")];
  if (f.type === "url") return [f.name, s.refine((v) => !v || /^https?:\/\/\S+$/.test(v), "Use a full link starting with https://")];
  if (f.name === "site_name") s = s.min(1, "Your site needs a name.");
  return [f.name, s];
})));

const pick = (src: Record<string, unknown>, ep: "site" | "biz"): Values =>
  Object.fromEntries(ALL.filter((f) => f.ep === ep && f.type !== "image").map((f) => [f.name, f.type === "toggle" ? !!src[f.name] : String(src[f.name] ?? "")]));

function ImagePick({ id, current, file, onFile }: { id: string; current?: string | null; file?: File; onFile: (f: File) => void }) {
  const [preview, setPreview] = useState("");
  useEffect(() => { if (!file) { setPreview(""); return; } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);
  const src = preview || (current ? mediaUrl(current) : "");
  return (
    <label htmlFor={id} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed p-2 transition-colors duration-150 focus-within:outline-2 focus-within:outline-ring hover:border-ring/60 hover:bg-accent">
      <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
        {src ? <Image src={src} alt="" fill sizes="56px" unoptimized={!!preview} className="object-contain" /> : <ImagePlus className="size-5 text-muted-foreground" aria-hidden />}
      </span>
      <span className="grid min-w-0 text-sm"><b className="truncate">{file ? file.name : src ? "Replace image" : "Upload image"}</b><span className="text-muted-foreground">PNG, JPG or WebP</span></span>
      <input id={id} type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </label>
  );
}

function SettingField({ f, control, current, file, onFile }: { f: F; control: Control<Values>; current?: string | null; file?: File; onFile: (f: File) => void }) {
  const id = `set-${f.name}`;
  if (f.type === "image") {
    return (
      <Field className={cn(f.full && "sm:col-span-2")}>
        <FieldLabel htmlFor={id}>{f.label}</FieldLabel>
        <ImagePick id={id} current={current} file={file} onFile={onFile} />
        {f.hint && <FieldDescription>{f.hint}</FieldDescription>}
      </Field>
    );
  }
  return (
    <Controller name={f.name} control={control} render={({ field, fieldState }) => {
      const desc = f.help || f.hint;
      const aria = { id, "aria-invalid": fieldState.invalid || undefined, "aria-describedby": desc ? `${id}-d` : undefined };
      if (f.type === "toggle") {
        return (
          <Field orientation="horizontal" className="justify-between rounded-lg border p-4 sm:col-span-2">
            <div className="grid gap-1"><FieldLabel htmlFor={id}>{f.label}</FieldLabel>{f.help && <FieldDescription id={`${id}-d`}>{f.help}</FieldDescription>}</div>
            <Switch {...aria} checked={!!field.value} onCheckedChange={field.onChange} />
          </Field>
        );
      }
      const val = String(field.value ?? "");
      return (
        <Field data-invalid={fieldState.invalid || undefined} className={cn((f.full || f.type === "textarea") && "sm:col-span-2")}>
          <FieldLabel htmlFor={f.type === "color" ? `${id}-hex` : id}>{f.label}</FieldLabel>
          {f.type === "textarea" ? <Textarea {...aria} rows={f.rows || 3} {...field} value={val} />
            : f.type === "secret" ? <PasswordInput {...aria} autoComplete="off" placeholder={f.placeholder} {...field} value={val} />
            : f.type === "color" ? (
              <div className="flex gap-2">
                <label className="relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-md border focus-within:outline-2 focus-within:outline-ring" style={{ background: HEX.test(val) ? val : "transparent" }}>
                  <span className="sr-only">Pick {f.label}</span>
                  <input id={id} type="color" className="absolute inset-0 size-full cursor-pointer opacity-0" value={HEX.test(val) ? val : "#7c3aed"} onChange={(e) => field.onChange(e.target.value)} />
                </label>
                <Input id={`${id}-hex`} aria-invalid={aria["aria-invalid"]} aria-describedby={aria["aria-describedby"]} maxLength={7} spellCheck={false} placeholder="#7C3AED" className="font-mono uppercase" {...field} value={val} />
              </div>
            )
            : <Input {...aria} type={f.type === "email" ? "email" : f.type === "url" ? "url" : "text"} inputMode={f.type === "url" ? "url" : undefined} placeholder={f.placeholder} {...field} value={val} />}
          {desc && <FieldDescription id={`${id}-d`}>{desc}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      );
    }} />
  );
}

export default function AdminSettings() {
  const { token } = useAuth();
  const [site, setSite] = useState<Record<string, unknown> | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [files, setFiles] = useState<Record<string, File>>({});
  const [active, setActive] = useState("brand");
  const [openOld, setOpenOld] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema) as never, defaultValues: {} });
  const { control, handleSubmit, reset, setError, watch, formState: { isDirty, isSubmitting } } = form;
  const dirty = isDirty || Object.keys(files).length > 0;

  useEffect(() => {
    if (!token) return;
    Promise.all([apiFetch(EP.site, { token }), apiFetch(EP.biz, { token })])
      .then(([s, b]) => { setSite(s); reset({ ...pick(s, "site"), ...pick(b, "biz") }); })
      .catch((e) => setLoadErr(errorText(e)));
  }, [token, reset]);

  // highlight the section in view
  useEffect(() => {
    if (!site) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id.slice(3))), { rootMargin: "-30% 0px -60% 0px" });
    SECTIONS.forEach(({ id }) => { const el = document.getElementById(`st-${id}`); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [site]);

  // warn before leaving with unsaved changes
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const onSave = handleSubmit(async (v) => {
    const fd = new FormData();
    ALL.filter((f) => f.ep === "site").forEach((f) => {
      if (f.type === "image") { if (files[f.name]) fd.append(f.name, files[f.name]); return; }
      fd.append(f.name, f.type === "toggle" ? (v[f.name] ? "true" : "false") : String(v[f.name] ?? ""));
    });
    const biz = Object.fromEntries(ALL.filter((f) => f.ep === "biz").map((f) => [f.name, v[f.name] ?? ""]));
    try {
      const [s, b] = await Promise.all([apiFetch(EP.site, { method: "PUT", token, body: fd }), apiFetch(EP.biz, { method: "PUT", token, body: biz })]);
      setSite(s); setFiles({}); reset({ ...pick(s, "site"), ...pick(b, "biz") });
      toast.success("Saved. Changes are live.");
    } catch (e) {
      const fe = fieldErrors(e);
      Object.entries(fe).forEach(([k, m]) => setError(k, { message: m }));
      toast.error(Object.keys(fe).length ? "Some fields need fixing. They're marked in red." : errorText(e));
    }
  }, () => toast.error("Some fields need fixing. They're marked in red."));

  const accent = watch("color_accent") as string, second = watch("color_secondary") as string, bg = watch("color_primary") as string;
  const preview = useMemo(() => ({ acc: effectiveAccent(HEX.test(accent || "") ? accent : null), sec: HEX.test(second || "") ? second : "#A78BFA", bg: HEX.test(bg || "") ? bg : "#0F172A" }), [accent, second, bg]);

  if (loadErr) return <Alert variant="destructive"><AlertDescription>{loadErr}</AlertDescription></Alert>;
  if (!site) return <div className="grid gap-4"><Skeleton className="h-16" /><Skeleton className="h-96" /></div>;

  return (
    <form onSubmit={onSave} noValidate className="grid gap-6">
      <PageHeader title="Settings" description="Everything about your site in one place. Changes go live when you save." />
      <div className="grid items-start gap-6 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto scrollbar-none lg:sticky lg:top-20 lg:flex-col">
          {SECTIONS.map(({ id, icon: Icon, title }) => (
            <a key={id} href={`#st-${id}`} aria-current={active === id ? "true" : undefined}
              onClick={(e) => { e.preventDefault(); if (id === "old") setOpenOld(true); document.getElementById(`st-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground aria-[current=true]:bg-accent aria-[current=true]:font-semibold aria-[current=true]:text-foreground">
              <Icon className="size-4" aria-hidden />{title}
            </a>
          ))}
        </nav>
        <div className="grid min-w-0 gap-6">
          {SECTIONS.map((sec) => {
            const fields = (
              <div className="grid gap-5 sm:grid-cols-2">
                {sec.fields.map((f) => <SettingField key={f.name} f={f} control={control} current={site[f.name] as string | null}
                  file={files[f.name]} onFile={(x) => setFiles((fs) => ({ ...fs, [f.name]: x }))} />)}
              </div>
            );
            const head = (
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-brand-text"><sec.icon className="size-5" aria-hidden /></span>
                <div className="grid flex-1 gap-1"><CardTitle className="text-lg"><h2>{sec.title}</h2></CardTitle><CardDescription>{sec.blurb}</CardDescription></div>
              </div>
            );
            return (
              <Card key={sec.id} id={`st-${sec.id}`} className="glass scroll-mt-20">
                {sec.collapsed ? (
                  <Collapsible open={openOld} onOpenChange={setOpenOld}>
                    <CardHeader className="flex flex-row items-start justify-between gap-3">{head}
                      <CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm">{openOld ? "Hide" : "Show"}<ChevronDown className={cn("transition-transform duration-200", openOld && "rotate-180")} aria-hidden /></Button></CollapsibleTrigger>
                    </CardHeader>
                    <CollapsibleContent><CardContent className="pt-6">{fields}</CardContent></CollapsibleContent>
                  </Collapsible>
                ) : (
                  <>
                    <CardHeader>{head}</CardHeader>
                    <CardContent className="grid gap-6">{fields}
                      {sec.id === "brand" && (
                        <div className="grid gap-2">
                          <p className="text-sm text-muted-foreground" id="brand-preview">Preview</p>
                          <div aria-labelledby="brand-preview" className="flex flex-wrap items-center gap-4 rounded-lg border p-4" style={{ background: preview.bg }}>
                            <b style={{ color: preview.sec }}>{(watch("site_name") as string) || "Your site"}</b>
                            <span className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: preview.acc, color: onColor(preview.acc) }}>Load now</span>
                            <span className="rounded-full border px-3 py-1 text-sm" style={{ color: preview.sec, borderColor: preview.sec }}>Fish Games</span>
                          </div>
                          <FieldDescription>Text on your main colour is switched to black or white automatically so it stays readable.</FieldDescription>
                        </div>
                      )}
                    </CardContent>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      </div>
      <div role="status" aria-live="polite"
        className={cn("sticky bottom-4 z-(--z-sticky) mx-auto flex w-full max-w-xl items-center gap-3 rounded-xl border bg-popover p-3 shadow-xl transition-[opacity,transform] duration-200",
          dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0")}>
        <Pencil className="size-4 shrink-0 text-warning" aria-hidden />
        <span className="flex-1 text-sm">{dirty ? "You have unsaved changes" : ""}</span>
        {dirty && <>
          <Button type="button" variant="ghost" size="sm" disabled={isSubmitting} onClick={() => { reset(); setFiles({}); }}><Undo2 aria-hidden />Undo</Button>
          <Button type="submit" size="sm" disabled={isSubmitting}>{isSubmitting ? <Spinner /> : <Save aria-hidden />}{isSubmitting ? "Saving…" : "Save changes"}</Button>
        </>}
      </div>
    </form>
  );
}
