"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Gift, Lock } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { PasswordInput } from "@/components/auth/password-input";
import { CopyButton } from "@/components/common/copy-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const codeSchema = z.object({ code: z.string().trim().min(2, "Enter a bonus code.").max(40) });

export function RewardsCard() {
  const { user, token } = useAuth();
  const form = useForm<z.infer<typeof codeSchema>>({ resolver: zodResolver(codeSchema), defaultValues: { code: "" } });
  const refLink = `${typeof window !== "undefined" ? window.location.origin : ""}/?ref=${user?.referral_code || ""}`;
  async function submit(v: z.infer<typeof codeSchema>) {
    try {
      const r = await apiFetch<{ title: string }>("/promos/redeem/", { method: "POST", token, body: v });
      toast.success(`${r.title} — staff will apply your bonus.`); form.reset();
    } catch (e) { form.setError("code", { message: errorText(e) || "That code isn't valid." }); }
  }
  const { errors, isSubmitting } = form.formState;
  return (
    <Card className="glass">
      <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Gift className="size-5 text-brand-text" aria-hidden /><h2>Bonus code &amp; referrals</h2></CardTitle></CardHeader>
      <CardContent className="grid gap-5">
        <form onSubmit={form.handleSubmit(submit)} noValidate>
          <Field data-invalid={!!errors.code}>
            <FieldLabel htmlFor="bonus-code">Bonus code</FieldLabel>
            <div className="flex gap-2">
              <Input id="bonus-code" autoComplete="off" autoCapitalize="characters" className="font-mono uppercase" aria-invalid={!!errors.code} {...form.register("code")} />
              <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>Redeem</Button>
            </div>
            <FieldError>{errors.code?.message}</FieldError>
          </Field>
        </form>
        <Field>
          <FieldLabel htmlFor="ref-link">Your referral link</FieldLabel>
          <div className="flex gap-2"><Input id="ref-link" readOnly value={refLink} className="text-sm" onFocus={(e) => e.currentTarget.select()} />
            <CopyButton value={refLink} label="referral link" size="icon" /></div>
          <CardDescription>Share it — you earn credit when friends join.</CardDescription>
        </Field>
      </CardContent>
    </Card>
  );
}

const pwSchema = z.object({
  current_password: z.string().min(1, "Enter your current password."),
  new_password: z.string().min(8, "Use at least 8 characters.").regex(/[a-z]/i, "Include a letter.").regex(/\d/, "Include a number."),
  confirm: z.string(),
}).refine((v) => v.new_password === v.confirm, { message: "The new passwords don't match.", path: ["confirm"] });
type Pw = z.infer<typeof pwSchema>;

export function PasswordCard() {
  const { token } = useAuth();
  const form = useForm<Pw>({ resolver: zodResolver(pwSchema), mode: "onTouched", defaultValues: { current_password: "", new_password: "", confirm: "" } });
  async function submit(v: Pw) {
    try {
      await apiFetch("/auth/change-password/", { method: "POST", token, body: { current_password: v.current_password, new_password: v.new_password } });
      toast.success("Password updated"); form.reset();
    } catch (e) { form.setError("current_password", { message: errorText(e) }); }
  }
  const { errors, isSubmitting } = form.formState;
  return (
    <Card className="glass">
      <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Lock className="size-5 text-brand-text" aria-hidden /><h2>Password</h2></CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(submit)} noValidate>
          <FieldGroup>
            {([["current_password", "Current password", "current-password"], ["new_password", "New password", "new-password"], ["confirm", "Confirm new password", "new-password"]] as const).map(([name, label, ac]) => (
              <Field key={name} data-invalid={!!errors[name]}>
                <FieldLabel htmlFor={`pw-${name}`}>{label}</FieldLabel>
                <PasswordInput id={`pw-${name}`} autoComplete={ac} aria-invalid={!!errors[name]} {...form.register(name)} />
                <FieldError>{errors[name]?.message}</FieldError>
              </Field>
            ))}
            <Button type="submit" className="w-fit" disabled={isSubmitting} aria-busy={isSubmitting}>{isSubmitting ? "Updating…" : "Update password"}</Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
