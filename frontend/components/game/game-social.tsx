"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Heart, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { RadioGroup as RadioPrimitive } from "radix-ui";
import { toast } from "sonner";
import { z } from "zod";
import { Stars } from "@/components/common/stars";
import { UserAvatar } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { GameDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Review { id: number; user_name: string; rating: number; comment: string; created_at: string }

const schema = z.object({
  rating: z.number().int().min(1, "Pick a rating.").max(5),
  comment: z.string().trim().max(1000, "Keep it under 1,000 characters.").optional(),
});
type Values = z.infer<typeof schema>;

/** Favourite toggle, reviews list and the review form on a game page. */
export function GameSocial({ game }: { game: GameDetail }) {
  const { user, token, ready } = useAuth();
  const [fav, setFav] = useState(!!game.is_favorited);
  const [reviews, setReviews] = useState<Review[]>([]);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { rating: 5, comment: "" } });

  useEffect(() => { apiFetch<Review[]>(`/reviews/?game=${game.slug}`).then(setReviews).catch(() => {}); }, [game.slug]);

  async function toggleFav() {
    try {
      const r = await apiFetch<{ favorited: boolean }>("/favorites/toggle/", { method: "POST", token, body: { game: game.id } });
      setFav(r.favorited); toast.success(r.favorited ? `${game.name} saved to your favourites` : "Removed from favourites");
    } catch (e) { toast.error(errorText(e)); }
  }

  async function submit(v: Values) {
    try {
      await apiFetch("/reviews/", { method: "POST", token, body: { game: game.slug, rating: v.rating, comment: v.comment || "" } });
      form.reset({ rating: 5, comment: "" });
      toast.success("Thanks — your review is posted.");
      setReviews(await apiFetch<Review[]>(`/reviews/?game=${game.slug}`));
    } catch (e) { form.setError("root", { message: errorText(e) }); }
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <Card className="glass">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-xl"><h2>Ratings & reviews</h2></CardTitle>
        {ready && user && (
          <Button variant={fav ? "default" : "outline"} size="sm" onClick={toggleFav} aria-pressed={fav}>
            <Heart className={fav ? "fill-current" : ""} aria-hidden />{fav ? "Saved" : "Save"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="flex items-center gap-4">
          <span className="text-4xl font-bold tabular-nums">{game.rating_count ? Number(game.rating_avg).toFixed(1) : "—"}</span>
          <div className="grid gap-1"><Stars value={game.rating_avg} size={18} />
            <span className="text-sm text-muted-foreground">{game.rating_count} review{game.rating_count === 1 ? "" : "s"}</span></div>
        </div>

        {ready && user ? (
          <form onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
            <Controller control={form.control} name="rating" render={({ field }) => (
              <FieldSet>
                <FieldLegend variant="label">Your rating</FieldLegend>
                <RadioPrimitive.Root aria-label="Your rating" orientation="horizontal" loop className="flex gap-1"
                  value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <RadioPrimitive.Item key={n} value={String(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`}
                      className="grid size-11 place-items-center rounded-md transition-colors duration-150 hover:bg-accent">
                      <Star className={cn("size-6 transition-colors duration-150", n <= field.value ? "fill-warning text-warning" : "text-muted-foreground")} aria-hidden />
                    </RadioPrimitive.Item>
                  ))}
                </RadioPrimitive.Root>
                <FieldError>{errors.rating?.message}</FieldError>
              </FieldSet>
            )} />
            <Field data-invalid={!!errors.comment}>
              <FieldLabel htmlFor="review-text">Your review <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
              <Textarea id="review-text" rows={3} aria-invalid={!!errors.comment} {...form.register("comment")} />
              <FieldDescription>Payouts, agent, gameplay — what should other players know?</FieldDescription>
              <FieldError>{errors.comment?.message}</FieldError>
            </Field>
            {errors.root && <p role="alert" className="text-sm text-destructive-text">{errors.root.message}</p>}
            <Button type="submit" className="w-fit" disabled={isSubmitting} aria-busy={isSubmitting}>{isSubmitting ? "Posting…" : "Post review"}</Button>
          </form>
        ) : (
          <p className="text-muted-foreground"><Link href="/login" className="font-semibold text-brand-text underline underline-offset-2">Sign in</Link> to rate this game.</p>
        )}

        {reviews.length ? (
          <ul className="grid gap-4">
            {reviews.map((r) => (
              <li key={r.id} className="flex gap-3">
                <UserAvatar name={r.user_name} size={36} />
                <div className="grid gap-1"><div className="flex items-center gap-2"><b>{r.user_name}</b><Stars value={r.rating} size={12} /></div>
                  {r.comment && <p className="max-w-prose text-muted-foreground">{r.comment}</p>}</div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No reviews yet. Be the first.</p>}
      </CardContent>
    </Card>
  );
}
