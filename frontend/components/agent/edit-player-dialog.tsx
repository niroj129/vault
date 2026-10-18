"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Dices } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { apiFetch, errorText, fieldErrors } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AdminUser } from "@/lib/types";
import { genPassword } from "./credentials";

const schema = z.object({
  full_name: z.string().trim().max(150), phone: z.string().trim().max(30),
  email: z.string().trim().refine((v) => !v || z.email().safeParse(v).success, "That email doesn't look right."),
  password: z.string().refine((v) => !v || v.length >= 6, "At least 6 characters."), is_active: z.boolean(),
});
type Values = z.infer<typeof schema>;

export function EditPlayerDialog({ player, open, onOpenChange, onSaved }: { player: AdminUser; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const { token } = useAuth();
  const form = useForm<Values>({ resolver: zodResolver(schema), values: { full_name: player.full_name || "", phone: player.phone || "", email: player.email || "", password: "", is_active: player.is_active !== false } });
  const { errors, isSubmitting } = form.formState;
  async function submit(v: Values) {
    try {
      await apiFetch(`/users/${player.id}/`, { method: "PATCH", token, body: { full_name: v.full_name, phone: v.phone, email: v.email, is_active: v.is_active, ...(v.password ? { password: v.password } : {}) } });
      toast.success(v.password ? `Saved. New site password: ${v.password}` : "Player saved", v.password ? { duration: 15000 } : undefined);
      onSaved(); onOpenChange(false);
    } catch (e) {
      const fe = fieldErrors(e);
      if (Object.keys(fe).length) Object.entries(fe).forEach(([k, m]) => form.setError(k in v ? (k as keyof Values) : "root", { message: m }));
      else form.setError("root", { message: errorText(e) });
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>Edit @{player.username}</DialogTitle><DialogDescription>Their details on this site. Game logins are managed on the Game accounts tab.</DialogDescription></DialogHeader>
        <form id="edit-player" noValidate onSubmit={form.handleSubmit(submit)} className="grid gap-4">
          <Field data-invalid={!!errors.full_name}><FieldLabel htmlFor="ep-name">Name</FieldLabel><Input id="ep-name" autoComplete="off" {...form.register("full_name")} /><FieldError>{errors.full_name?.message}</FieldError></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="ep-phone">Phone</FieldLabel><Input id="ep-phone" type="tel" inputMode="tel" autoComplete="off" {...form.register("phone")} /></Field>
            <Field data-invalid={!!errors.email}><FieldLabel htmlFor="ep-email">Email</FieldLabel><Input id="ep-email" type="email" autoComplete="off" aria-invalid={!!errors.email} {...form.register("email")} /><FieldError>{errors.email?.message}</FieldError></Field>
          </div>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="ep-pw">New site password <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
            <InputGroup>
              <InputGroupInput id="ep-pw" autoComplete="new-password" className="font-mono" placeholder="Leave empty to keep it" aria-invalid={!!errors.password} {...form.register("password")} />
              <InputGroupAddon align="inline-end"><InputGroupButton type="button" size="icon-xs" aria-label="Make a password" onClick={() => form.setValue("password", genPassword(), { shouldValidate: true })}><Dices aria-hidden /></InputGroupButton></InputGroupAddon>
            </InputGroup>
            <FieldDescription>This is their login for this website, not for a game.</FieldDescription><FieldError>{errors.password?.message}</FieldError>
          </Field>
          <Controller control={form.control} name="is_active" render={({ field }) => (
            <Field orientation="horizontal" className="justify-between rounded-lg border p-3"><FieldContent><FieldLabel htmlFor="ep-active">Account active</FieldLabel><FieldDescription>Off: they can&apos;t sign in.</FieldDescription></FieldContent>
              <Switch id="ep-active" checked={field.value} onCheckedChange={field.onChange} /></Field>
          )} />
          {errors.root && <p role="alert" className="text-sm text-destructive-text">{errors.root.message}</p>}
        </form>
        <DialogFooter className="gap-2 sm:gap-2"><Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="edit-player" disabled={isSubmitting} aria-busy={isSubmitting}>{isSubmitting ? <Spinner aria-hidden /> : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
