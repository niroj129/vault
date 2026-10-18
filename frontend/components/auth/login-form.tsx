"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useSite } from "@/components/site-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PasswordInput } from "./password-input";

const schema = z.object({
  username: z.string().trim().min(1, "Enter your username."),
  password: z.string().min(1, "Enter your password."),
});
type Values = z.infer<typeof schema>;

/** Where each role starts. The owner starts in their console, not in one site's admin. */
const home = (u: { role: string; is_platform_owner?: boolean }) => (u.is_platform_owner ? "/platform" : u.role === "admin" ? "/admin" : u.role === "agent" ? "/agent" : "/");

export function LoginForm() {
  const site = useSite();
  const { login } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { username: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  async function submit(v: Values) {
    try {
      const user = await login(v.username.trim(), v.password);
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : home(user));
    } catch (e) {
      form.setError("root", { message: e instanceof ApiError && e.status >= 500 ? "We can't reach the server. Try again in a moment." : "Incorrect username or password." });
      form.setFocus("password");
    }
  }

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle><h1 className="text-2xl">Welcome back</h1></CardTitle>
        <CardDescription>Sign in to load games, chat with support and see your logins.</CardDescription>
      </CardHeader>
      <CardContent>
        <form id="login" onSubmit={form.handleSubmit(submit)} noValidate>
          <FieldGroup>
            {errors.root && <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm font-medium text-destructive-text">{errors.root.message}</p>}
            <Field data-invalid={!!errors.username}>
              <FieldLabel htmlFor="username">Username</FieldLabel>
              <Input id="username" autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false} aria-invalid={!!errors.username} {...form.register("username")} />
              <FieldError>{errors.username?.message}</FieldError>
            </Field>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <PasswordInput id="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register("password")} />
              <FieldError>{errors.password?.message}</FieldError>
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting} aria-busy={isSubmitting}>
              {isSubmitting ? <><Spinner aria-hidden />Signing in…</> : <>Sign in<ArrowRight aria-hidden /></>}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="grid justify-items-center gap-2 text-center text-sm text-muted-foreground">
        <p>{site.allow_signup !== false
          ? <>New here? <Link href="/signup" className="font-semibold text-brand-text underline underline-offset-2">Create an account</Link> — it takes a minute.</>
          : <>New here? Accounts are opened by our team — <Link href="/business" className="font-semibold text-brand-text underline underline-offset-2">ask for one</Link>.</>}</p>
        <Link href="/" className="inline-flex min-h-11 items-center hover:text-foreground">Back to the lobby</Link>
      </CardFooter>
    </Card>
  );
}
