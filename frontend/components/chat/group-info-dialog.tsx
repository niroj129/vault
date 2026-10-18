"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LogOut, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { UserAvatar } from "@/components/common/user-avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Conversation } from "@/lib/types";
import { PeoplePicker, type Person } from "./people-picker";

const schema = z.object({ title: z.string().trim().max(120, "Keep it under 120 characters.") });

/** Group (or SMS thread) details: rename, members, add/remove, leave. */
export function GroupInfoDialog({ conv, open, onOpenChange, onChanged, onLeft }:
  { conv: Conversation; open: boolean; onOpenChange: (o: boolean) => void; onChanged: () => void; onLeft: () => void }) {
  const { user, token } = useAuth();
  const isGroup = conv.kind === "group";
  const canManage = !isGroup || conv.my_role === "owner" || conv.my_role === "admin";
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), values: { title: conv.raw_title || "" } });

  async function run(fn: () => Promise<void>, done?: string) {
    setBusy(true);
    try { await fn(); if (done) toast.success(done); } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  }
  const remove = (uid: number, name: string) => run(async () => {
    await apiFetch(`/messenger/conversations/${conv.id}/members/${uid}/`, { method: "DELETE", token });
    if (uid === user?.id) onLeft(); else onChanged();
  }, uid === user?.id ? "You left the group" : `Removed ${name}`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isGroup ? "Group info" : conv.channel === "whatsapp" ? "WhatsApp chat" : conv.channel === "sendblue" ? "iMessage chat" : "SMS thread"}</DialogTitle>
          <DialogDescription>{conv.kind === "sms" ? <>Phone <b>{conv.phone}</b>. Every admin sees this thread.</> : `${conv.members.length} members`}</DialogDescription>
        </DialogHeader>
        {canManage ? (
          <form noValidate className="flex items-end gap-2" onSubmit={form.handleSubmit((v) => run(async () => {
            await apiFetch(`/messenger/conversations/${conv.id}/`, { method: "PATCH", token, body: v }); onChanged(); }, "Name saved"))}>
            <Field data-invalid={!!form.formState.errors.title} className="flex-1">
              <FieldLabel htmlFor="conv-title">{isGroup ? "Group name" : "Contact name"}</FieldLabel>
              <Input id="conv-title" maxLength={120} {...form.register("title")} />
              <FieldError>{form.formState.errors.title?.message}</FieldError>
            </Field>
            <Button type="submit" variant="secondary" disabled={busy || !form.formState.isDirty}>Save</Button>
          </form>
        ) : <p className="font-semibold">{conv.title}</p>}

        <section aria-labelledby="members-h" className="grid gap-2">
          <h3 id="members-h" className="text-sm font-semibold text-muted-foreground">{conv.members.length} {isGroup ? "members" : "staff in thread"}</h3>
          <ul className="grid max-h-64 gap-1 overflow-y-auto">
            {conv.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-md p-2">
                <UserAvatar name={m.full_name || m.username} src={m.avatar} size={36} online={m.online} />
                <span className="grid min-w-0 flex-1"><b className="truncate">{m.full_name || m.username}{m.id === user?.id && " (you)"}</b>
                  <span className="text-sm text-muted-foreground">@{m.username}{m.member_role !== "member" && ` · ${m.member_role}`}</span></span>
                {isGroup && canManage && m.id !== user?.id && m.member_role !== "owner" && (
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => remove(m.id, m.username)}>Remove<span className="sr-only"> {m.username}</span></Button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {isGroup && canManage && (adding ? (
          <div className="grid gap-3 rounded-lg border p-3">
            <PeoplePicker selected={picked} multi exclude={conv.members.map((m) => m.id)}
              onToggle={(p) => setPicked((cur) => (cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : [...cur, p]))} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setAdding(false); setPicked([]); }}>Cancel</Button>
              <Button disabled={busy || !picked.length} onClick={() => run(async () => {
                await apiFetch(`/messenger/conversations/${conv.id}/members/`, { method: "POST", token, body: { user_ids: picked.map((p) => p.id) } });
                setPicked([]); setAdding(false); onChanged(); }, "Added")}>Add {picked.length || ""}</Button>
            </div>
          </div>
        ) : <Button variant="outline" className="w-fit" onClick={() => setAdding(true)}><UserPlus aria-hidden />Add people</Button>)}

        {isGroup && (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="ghost" className="w-fit text-destructive-text hover:text-destructive-text"><LogOut aria-hidden />Leave group</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Leave “{conv.title}”?</AlertDialogTitle>
                <AlertDialogDescription>You won&apos;t get its messages any more. Someone will need to add you back.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Stay</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => user && remove(user.id, user.username)}>Leave group</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
