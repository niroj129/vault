"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Check, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useSite } from "@/components/site-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText, fieldErrors } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PasswordInput } from "./password-input";

const PW_RULES: [RegExp | ((s: string) => boolean), string][] = [[(s) => s.length >= 8, "8+ characters"], [/[a-z]/i, "a letter"], [/\d/, "a number"]];
const passes = (pw: string) => PW_RULES.map(([r, label]) => [typeof r === "function" ? r(pw) : r.test(pw), label] as const);

const schema = z.object({
  username: z.string().trim().regex(/^[A-Za-z0-9_]{3,24}$/, "3–24 letters, numbers or _ only."),
  password: z.string().refine((pw) => passes(pw).every(([ok]) => ok), "Use 8+ characters with at least a letter and a number."),
  full_name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  ref: z.string().optional(),
});
type Values = z.infer<typeof schema>;

export function SignupForm() {
  const site = useSite();
  const { startSession } = useAuth();
  const router = useRouter();
  const ref = useSearchParams().get("ref") || "";
  const form = useForm<Values>({ resolver: zodResolver(schema), mode: "onTouched",
    defaultValues: { username: "", password: "", full_name: "", phone: "", ref } });
  const { errors, isSubmitting } = form.formState;
  const pw = form.watch("password");
  const uname = form.watch("username");

  async function submit(v: Values) {
    try {
      const r = await apiFetch<{ token: string; user: User }>("/auth/signup/", { method: "POST", body: v });
      startSession(r.token, r.user);
      router.push("/load?welcome=1");
    } catch (e) {
      const fe = fieldErrors(e);
      Object.entries(fe).forEach(([k, m]) => form.setError(k as keyof Values, { message: m }));
      if (!Object.keys(fe).length) form.setError("root", { message: errorText(e) });
    }
  }

  if (site.allow_signup === false) {
    return (
      <Card className="glass">
        <CardHeader><CardTitle><h1 className="text-2xl">Sign-up is closed</h1></CardTitle><CardDescription>New accounts are opened by our team.</CardDescription></CardHeader>
        <CardContent><Button asChild className="w-full"><Link href="/business">Contact us</Link></Button></CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle><h1 className="text-2xl">Create your account</h1></CardTitle>
        <CardDescription>One account for every game on {site.site_name || "the site"}. Pay, load and play — all here.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(submit)} noValidate>
          <FieldGroup>
            {errors.root && <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm font-medium text-destructive-text">{errors.root.message}</p>}
            <Field data-invalid={!!errors.username}>
              <FieldLabel htmlFor="su-username">Username</FieldLabel>
              <Input id="su-username" autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={24}
                aria-invalid={!!errors.username} aria-describedby="su-username-hint" {...form.register("username")} />
              {errors.username ? <FieldError>{errors.username.message}</FieldError>
                : <FieldDescription id="su-username-hint">Letters, numbers and _ · others message you as @{uname || "username"}</FieldDescription>}
            </Field>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="su-password">Password</FieldLabel>
              <PasswordInput id="su-password" autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby="su-pw-rules" {...form.register("password")} />
              <ul id="su-pw-rules" aria-label="Password needs" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {passes(pw).map(([ok, label]) => (
                  <li key={label} className={cn("flex items-center gap-1", ok ? "text-success" : "text-muted-foreground")}>
                    {ok ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}{label}<span className="sr-only">{ok ? " — done" : " — needed"}</span>
                  </li>
                ))}
              </ul>
              <FieldError>{errors.password?.message}</FieldError>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="su-name">Name <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
                <Input id="su-name" autoComplete="name" {...form.register("full_name")} />
              </Field>
              <Field data-invalid={!!errors.phone}>
                <FieldLabel htmlFor="su-phone">Phone <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
                <Input id="su-phone" type="tel" inputMode="tel" autoComplete="tel" {...form.register("phone")} />
                <FieldError>{errors.phone?.message}</FieldError>
              </Field>
            </div>
            {ref && <p className="text-sm text-muted-foreground">Referral code: <b className="text-foreground">{ref}</b></p>}
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting} aria-busy={isSubmitting}>
              {isSubmitting ? <><Spinner aria-hidden />Creating account…</> : <>Create account<ArrowRight aria-hidden /></>}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="grid justify-items-center gap-1 text-center text-sm text-muted-foreground">
        <p>Already have an account? <Link href="/login" className="font-semibold text-brand-text underline underline-offset-2">Sign in</Link></p>
        <p>18+ only. By signing up you agree to the <Link href="/business#terms" className="underline underline-offset-2 hover:text-foreground">site rules</Link>.</p>
      </CardFooter>
    </Card>
  );
}
