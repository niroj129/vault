"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { UserAvatar } from "@/components/common/user-avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const schema = z.object({
  full_name: z.string().trim().max(150, "Keep it under 150 characters."),
  bio: z.string().trim().max(160, "Keep it under 160 characters."),
});
type Values = z.infer<typeof schema>;

export function ProfileHeader() {
  const { user, token, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), values: { full_name: user?.full_name || "", bio: user?.bio || "" } });
  if (!user) return null;

  async function patch(body: FormData | Record<string, unknown>, done: string) {
    setBusy(true);
    try { await apiFetch("/messenger/profile/", { method: "PATCH", token, body }); await refreshUser(); toast.success(done); return true; }
    catch (e) { toast.error(errorText(e)); return false; } finally { setBusy(false); }
  }
  function upload(f?: File) {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("Photos must be 5 MB or smaller."); return; }
    const fd = new FormData(); fd.append("avatar", f); void patch(fd, "Photo updated");
  }
  const { errors, isSubmitting } = form.formState;

  return (
    <Card className="glass">
      <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="relative w-fit">
          <UserAvatar name={user.full_name || user.username} src={user.avatar} size={96} />
          <Button size="icon-sm" variant="secondary" className="absolute -right-1 -bottom-1 rounded-full ring-2 ring-background" aria-label="Change photo"
            onClick={() => fileRef.current?.click()} disabled={busy}><Camera aria-hidden /></Button>
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        {editing ? (
          <form className="flex-1" noValidate onSubmit={form.handleSubmit(async (v) => { if (await patch(v, "Profile saved")) setEditing(false); })}>
            <FieldGroup>
              <Field data-invalid={!!errors.full_name}>
                <FieldLabel htmlFor="pf-name">Display name</FieldLabel>
                <Input id="pf-name" autoComplete="name" autoFocus aria-invalid={!!errors.full_name} {...form.register("full_name")} />
                <FieldError>{errors.full_name?.message}</FieldError>
              </Field>
              <Field data-invalid={!!errors.bio}>
                <FieldLabel htmlFor="pf-bio">Bio</FieldLabel>
                <Textarea id="pf-bio" rows={2} aria-invalid={!!errors.bio} {...form.register("bio")} />
                <FieldDescription>A line about you, shown on your profile card.</FieldDescription>
                <FieldError>{errors.bio?.message}</FieldError>
              </Field>
              <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>{isSubmitting ? "Saving…" : "Save"}</Button>
                <Button type="button" variant="ghost" onClick={() => { form.reset(); setEditing(false); }}>Cancel</Button>
              </div>
            </FieldGroup>
          </form>
        ) : (
          <div className="grid flex-1 gap-1">
            <h1 className="text-3xl">{user.full_name || user.username}</h1>
            <p className="text-muted-foreground">@{user.username}</p>
            {user.bio && <p className="max-w-prose">{user.bio}</p>}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil aria-hidden />Edit profile</Button>
              {user.avatar && (
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="ghost" size="sm" disabled={busy}><Trash2 aria-hidden />Remove photo</Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Remove your photo?</AlertDialogTitle>
                      <AlertDialogDescription>People will see your initials instead. You can upload a new photo any time.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Keep photo</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void patch({ remove_avatar: true }, "Photo removed")}>Remove photo</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
