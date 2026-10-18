"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const PLANS = [["starter", "Starter"], ["pro", "Pro"], ["enterprise", "Enterprise"]] as const;
export const FEATURES = [["feature_games", "Games & links"], ["feature_messenger", "Messenger (chats & groups)"], ["feature_sms", "SMS & WhatsApp to phones"], ["feature_payments", "Payments"]] as const;

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export const siteSchema = (isNew: boolean) => z.object({
  name: z.string().trim().min(2, "Name the site."),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only."),
  domains: z.string().trim().min(1, "Add at least one domain."),
  plan: z.enum(["starter", "pro", "enterprise"]),
  monthly_price: z.string().refine((v) => Number(v) >= 0, "Enter a price."),
  paid_until: z.string().optional(),
  max_users: z.string().refine((v) => Number.isInteger(Number(v || 0)) && Number(v || 0) >= 0, "Whole number, 0 for unlimited."),
  owner_email: z.union([z.literal(""), z.email("That email doesn't look right.")]),
  notes: z.string().max(2000).optional(),
  feature_games: z.boolean(), feature_messenger: z.boolean(), feature_sms: z.boolean(), feature_payments: z.boolean(), use_owner_bytepayout: z.boolean(),
  admin_username: isNew ? z.string().trim().min(3, "At least 3 characters.") : z.string().optional(),
  admin_password: isNew ? z.string().min(8, "At least 8 characters.") : z.string().optional(),
  color_accent: z.string().optional(),
  seed_demo: z.boolean().optional(),
});
export type SiteValues = z.infer<ReturnType<typeof siteSchema>>;

export function SiteForm({ initial, isNew, onSubmit, onCancel }:
  { initial: SiteValues; isNew: boolean; onSubmit: (v: SiteValues) => Promise<string | void>; onCancel: () => void }) {
  const form = useForm<SiteValues>({ resolver: zodResolver(siteSchema(isNew)), defaultValues: initial });
  const { errors, isSubmitting } = form.formState;
  const text = (name: keyof SiteValues, label: string, opts: { type?: string; help?: string; full?: boolean } = {}) => (
    <Field data-invalid={!!errors[name]} className={opts.full ? "sm:col-span-2" : undefined}>
      <FieldLabel htmlFor={`site-${name}`}>{label}</FieldLabel>
      <Input id={`site-${name}`} type={opts.type || "text"} aria-invalid={!!errors[name]} disabled={name === "slug" && !isNew} {...form.register(name)} />
      {opts.help && <FieldDescription>{opts.help}</FieldDescription>}
      <FieldError>{errors[name]?.message as string | undefined}</FieldError>
    </Field>
  );
  async function submit(v: SiteValues) { const err = await onSubmit(v); if (err) form.setError("root", { message: err }); }
  return (
    <form noValidate onSubmit={form.handleSubmit(submit)}>
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="site-name">Site name</FieldLabel>
          <Input id="site-name" placeholder="Lucky Star Casino" aria-invalid={!!errors.name}
            {...form.register("name", { onChange: (e) => isNew && form.setValue("slug", slugify(e.target.value)) })} />
          <FieldError>{errors.name?.message}</FieldError>
        </Field>
        {text("slug", "Short ID", { help: isNew ? "Used in links and the delete confirmation." : "Can't be changed." })}
        {text("domains", "Domains", { full: true, help: "Comma separated. Point each domain's DNS at this server. For local testing use name.localhost." })}
        <Controller control={form.control} name="plan" render={({ field }) => (
          <Field><FieldLabel htmlFor="site-plan">Plan</FieldLabel>
            <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="site-plan" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{PLANS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></Field>
        )} />
        {text("monthly_price", "Monthly price ($)", { type: "number" })}
        {text("paid_until", "Paid until", { type: "date" })}
        {text("max_users", "Account limit", { type: "number", help: "0 = unlimited" })}
        {text("owner_email", "Operator email", { type: "email", full: true })}
        <FieldSet className="sm:col-span-2">
          <FieldLegend variant="label">Included features</FieldLegend>
          <div className="grid gap-2 sm:grid-cols-2">
            {FEATURES.map(([k, l]) => (
              <Controller key={k} control={form.control} name={k} render={({ field }) => (
                <Field orientation="horizontal" className="min-h-10"><Checkbox id={`site-${k}`} checked={!!field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                  <FieldLabel htmlFor={`site-${k}`} className="font-normal">{l}</FieldLabel></Field>
              )} />
            ))}
          </div>
        </FieldSet>
        <Controller control={form.control} name="use_owner_bytepayout" render={({ field }) => (
          <Field orientation="horizontal" className="items-start rounded-lg border p-3 sm:col-span-2"><Checkbox id="site-ownerbp" className="mt-0.5" checked={!!field.value} onCheckedChange={(c) => field.onChange(c === true)} />
            <div className="grid gap-1"><FieldLabel htmlFor="site-ownerbp">Give this site a BytePayout account under mine</FieldLabel>
              <FieldDescription>Card and app payments land in your BytePayout account. The site gets a BytePayout page showing the balance you hold for it, and you record payouts to it. A site with its own BytePayout key keeps using that key. Needs Payments turned on.</FieldDescription></div></Field>
        )} />
        {isNew && (
          <>
            {text("admin_username", "Operator admin username")}
            {text("admin_password", "Operator admin password", { type: "password", help: "At least 8 characters. Share it with the operator privately." })}
            <Field><FieldLabel htmlFor="site-color">Brand colour</FieldLabel>
              <Input id="site-color" type="color" className="h-11 w-20 cursor-pointer p-1" {...form.register("color_accent")} /></Field>
            <Controller control={form.control} name="seed_demo" render={({ field }) => (
              <Field orientation="horizontal" className="min-h-10 self-end"><Checkbox id="site-seed" checked={!!field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                <FieldLabel htmlFor="site-seed" className="font-normal">Start with demo games &amp; content</FieldLabel></Field>
            )} />
          </>
        )}
        <Field className="sm:col-span-2"><FieldLabel htmlFor="site-notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
          <Textarea id="site-notes" rows={2} {...form.register("notes")} /></Field>
      </FieldGroup>
      {errors.root && <p role="alert" className="mt-4 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive-text">{errors.root.message}</p>}
      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>{isSubmitting ? "Saving…" : isNew ? "Create site" : "Save changes"}</Button>
      </DialogFooter>
    </form>
  );
}
