"use client";

import { Layers, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { StatCard } from "@/components/admin/stat-card";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, errorText, getJSONSafe } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { PaymentMethodInfo } from "@/lib/types";

type FieldSpec = [name: string, label: string, type?: "number" | "date" | "text", optional?: boolean];
interface Action { title: string; path: string; btn: string; fields: FieldSpec[]; method?: boolean; primary?: boolean }

const ACTIONS: Action[] = [
  { title: "Create player account", path: "/gameapi/add-user/", btn: "Create account", fields: [["account", "Login name"], ["login_pwd", "Password"]] },
  { title: "Find player ID", path: "/gameapi/get-user-id/", btn: "Look up", fields: [["account_name", "Login name"]] },
  { title: "Load / recharge", path: "/gameapi/recharge/", btn: "Load account", primary: true, method: true,
    fields: [["account_name", "Login name (for the record)", "text", true], ["user_id", "Player ID"], ["amount", "Amount", "number"]] },
  { title: "Withdraw / cash out", path: "/gameapi/withdraw/", btn: "Withdraw", method: true,
    fields: [["account_name", "Login name (for the record)", "text", true], ["user_id", "Player ID"], ["amount", "Amount", "number"]] },
  { title: "Player balance", path: "/gameapi/user-balance/", btn: "Check balance", fields: [["user_id", "Player ID"]] },
  { title: "Reset password", path: "/gameapi/reset-password/", btn: "Reset", fields: [["user_id", "Player ID"], ["login_pwd", "New password"]] },
  { title: "Force player offline", path: "/gameapi/player-offline/", btn: "Force offline", fields: [["user_id", "Player ID"]] },
  { title: "Low-balance users", path: "/gameapi/low-deposit/", btn: "Fetch", fields: [["query_date", "Date", "date"]] },
];

function ActionCard({ a, methods, onRun }: { a: Action; methods: string[]; onRun: (a: Action, v: Record<string, string>) => Promise<void> }) {
  const schema = useMemo(() => z.object(Object.fromEntries([
    ...a.fields.map(([n, label, type, optional]) => {
      let s = z.string().trim();
      if (!optional) s = s.min(1, `${label} is required.`);
      if (type === "number") return [n, s.refine((v) => !v || Number(v) > 0, "Enter an amount above 0.")];
      return [n, s];
    }),
    ...(a.method ? [["payment_method", z.string()]] : []),
  ])), [a]);
  const form = useForm<Record<string, string>>({ resolver: zodResolver(schema) as never,
    defaultValues: Object.fromEntries([...a.fields.map(([n]) => [n, ""]), ...(a.method ? [["payment_method", methods[0] || ""]] : [])]) });
  const { errors, isSubmitting } = form.formState;
  const id = (n: string) => `${a.path.split("/")[2]}-${n}`;
  return (
    <Card className="glass">
      <CardHeader><CardTitle className="text-base"><h2>{a.title}</h2></CardTitle></CardHeader>
      <CardContent>
        <form noValidate onSubmit={form.handleSubmit((v) => onRun(a, v))}>
          <FieldGroup className="gap-4">
            {a.fields.map(([n, label, type]) => (
              <Field key={n} data-invalid={!!errors[n]}><FieldLabel htmlFor={id(n)}>{label}</FieldLabel>
                <Input id={id(n)} type={type || "text"} inputMode={type === "number" ? "decimal" : undefined} autoComplete="off" aria-invalid={!!errors[n]} {...form.register(n)} />
                <FieldError>{errors[n]?.message as string}</FieldError></Field>
            ))}
            {a.method && (
              <Controller control={form.control} name="payment_method" render={({ field }) => (
                <Field><FieldLabel htmlFor={id("pm")}>Payment method</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id={id("pm")} className="w-full"><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>{methods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></Field>
              )} />
            )}
            <Button type="submit" variant={a.primary ? "default" : "secondary"} disabled={isSubmitting} className="w-full">{isSubmitting && <Spinner />}{a.btn}</Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

export default function GamePlatform() {
  const { token } = useAuth();
  const [st, setSt] = useState<{ configured: boolean; agent_balance?: string | null; error?: string } | null>(null);
  const [methods, setMethods] = useState<string[]>([]);
  const [out, setOut] = useState<{ label: string; data?: unknown; error?: string } | null>(null);

  const loadStatus = useCallback(() => { apiFetch("/gameapi/status/", { token }).then(setSt).catch(() => {}); }, [token]);
  useEffect(() => { if (!token) return; loadStatus(); getJSONSafe<PaymentMethodInfo[]>("/payment-methods/", []).then((m) => setMethods(m.map((x) => x.name))); }, [token, loadStatus]);

  async function run(a: Action, v: Record<string, string>) {
    try { setOut({ label: a.title, data: await apiFetch(a.path, { method: "POST", token, body: v }) }); loadStatus(); }
    catch (e) { setOut({ label: a.title, error: errorText(e) }); }
    requestAnimationFrame(() => document.getElementById("gp-result")?.focus());
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="Game platform console" description="Direct calls to the older single game API. Newer platforms live under Game APIs." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Layers} label="Game API" value={st ? (st.configured ? "Connected" : "Not set") : "…"} tone={st && !st.configured ? "warn" : undefined} />
        <StatCard icon={Wallet} label="Agent balance" value={String(st?.agent_balance ?? "—")} />
      </div>
      {st && !st.configured && <Alert variant="destructive"><AlertTitle>Not connected</AlertTitle><AlertDescription>Add the Game API URL, agent ID and secret in Settings → Old connections to use these actions.</AlertDescription></Alert>}
      {st?.error && <Alert variant="destructive"><AlertTitle>API error</AlertTitle><AlertDescription>{st.error}</AlertDescription></Alert>}
      {out && (
        <Card id="gp-result" tabIndex={-1} className="glass outline-none" aria-live="polite">
          <CardHeader><CardTitle className="text-base"><h2>Result: {out.label}</h2></CardTitle></CardHeader>
          <CardContent>{out.error ? <Alert variant="destructive"><AlertDescription>{out.error}</AlertDescription></Alert>
            : <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-sm whitespace-pre-wrap text-muted-foreground">{JSON.stringify(out.data, null, 2)}</pre>}</CardContent>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ACTIONS.map((a) => <ActionCard key={a.path} a={a} methods={methods} onRun={run} />)}
      </div>
    </div>
  );
}
