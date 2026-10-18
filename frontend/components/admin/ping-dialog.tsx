"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AdminUser } from "@/lib/types";

const schema = z.object({ channel: z.enum(["email", "sms", "both"]), subject: z.string().trim().max(150), message: z.string().trim().min(2, "Write a message.").max(1000) });

/** "Hit up" a player by email and/or SMS. */
export function PingDialog({ player, onClose }: { player: AdminUser; onClose: () => void }) {
  const { token } = useAuth();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { channel: player.email ? "email" : "sms", subject: "A message from support", message: "" } });
  async function send(v: z.infer<typeof schema>) {
    try {
      const r = await apiFetch<{ email?: string; sms?: string }>("/players/ping/", { method: "POST", token, body: { user: player.id, ...v } });
      toast.success("Sent", { description: `Email: ${r.email || "—"} · SMS: ${r.sms || "—"}` }); onClose();
    } catch (e) { form.setError("root", { message: errorText(e) }); }
  }
  const { errors, isSubmitting } = form.formState;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Message {player.username}</DialogTitle><DialogDescription>Email: {player.email || "none"} · Phone: {player.phone || "none"}</DialogDescription></DialogHeader>
        <form noValidate onSubmit={form.handleSubmit(send)}>
          <FieldGroup>
            <Controller control={form.control} name="channel" render={({ field }) => (
              <Field><FieldLabel htmlFor="ping-ch">Send by</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="ping-ch" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent></Select></Field>
            )} />
            <Field><FieldLabel htmlFor="ping-subj">Subject</FieldLabel><Input id="ping-subj" {...form.register("subject")} /></Field>
            <Field data-invalid={!!errors.message}><FieldLabel htmlFor="ping-msg">Message</FieldLabel>
              <Textarea id="ping-msg" rows={4} placeholder="Come back and claim your bonus!" aria-invalid={!!errors.message} {...form.register("message")} /><FieldError>{errors.message?.message}</FieldError></Field>
            {errors.root && <p role="alert" className="text-sm text-destructive-text">{errors.root.message}</p>}
            <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>{isSubmitting ? "Sending…" : "Send"}</Button></DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
