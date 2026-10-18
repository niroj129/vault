"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorText, fieldErrors } from "@/lib/api";

const schema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(120),
  email: z.union([z.literal(""), z.email("That email doesn't look right.")]),
  phone: z.string().trim().max(40).optional(),
  message: z.string().trim().min(5, "Write a few words so we can help.").max(4000),
}).refine((v) => v.email || v.phone, { message: "Add an email or phone so we can reply.", path: ["email"] });
type Values = z.infer<typeof schema>;

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "", phone: "", message: "" } });
  const { errors, isSubmitting } = form.formState;

  async function submit(v: Values) {
    try { await apiFetch("/contact/", { method: "POST", body: v }); setSent(true); }
    catch (e) {
      const fe = fieldErrors(e);
      Object.entries(fe).forEach(([k, m]) => form.setError(k as keyof Values, { message: m }));
      if (!Object.keys(fe).length) form.setError("root", { message: errorText(e) });
    }
  }

  if (sent) {
    return (
      <Alert role="status"><CheckCircle2 className="text-success" aria-hidden /><AlertTitle>Message received</AlertTitle>
        <AlertDescription>Thanks! We&apos;ll be in touch shortly.</AlertDescription></Alert>
    );
  }
  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="c-name">Your name</FieldLabel>
          <Input id="c-name" autoComplete="name" aria-invalid={!!errors.name} {...form.register("name")} />
          <FieldError>{errors.name?.message}</FieldError>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="c-email">Email</FieldLabel>
            <Input id="c-email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} {...form.register("email")} />
            <FieldError>{errors.email?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="c-phone">Phone / WhatsApp</FieldLabel>
            <Input id="c-phone" type="tel" autoComplete="tel" inputMode="tel" {...form.register("phone")} />
          </Field>
        </div>
        <Field data-invalid={!!errors.message}>
          <FieldLabel htmlFor="c-msg">Message</FieldLabel>
          <Textarea id="c-msg" rows={5} aria-invalid={!!errors.message} {...form.register("message")} />
          <FieldError>{errors.message?.message}</FieldError>
        </Field>
        {errors.root && <p role="alert" className="text-sm text-destructive-text">{errors.root.message}</p>}
        <Button type="submit" className="w-full sm:w-fit" disabled={isSubmitting} aria-busy={isSubmitting}>{isSubmitting ? "Sending…" : "Send message"}</Button>
      </FieldGroup>
    </form>
  );
}
