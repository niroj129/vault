"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import Stars from "./Stars";

/** Favorite toggle + reviews list + submit form for a game landing page. */
export default function GameSocial({ game }) {
  const { user, token, ready } = useAuth();
  const [fav, setFav] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => { setFav(!!game.is_favorited); }, [game.is_favorited]);
  useEffect(() => {
    apiFetch(`/reviews/?game=${game.slug}`).then(setReviews).catch(() => {});
  }, [game.slug]);

  async function toggleFav() {
    if (!user) return;
    try { const r = await apiFetch("/favorites/toggle/", { method: "POST", token, body: { game: game.id } }); setFav(r.favorited); }
    catch {}
  }

  async function submitReview(e) {
    e.preventDefault();
    try {
      await apiFetch("/reviews/", { method: "POST", token, body: { game: game.slug, rating, comment } });
      setComment(""); setMsg("Thanks for your review!");
      setReviews(await apiFetch(`/reviews/?game=${game.slug}`));
    } catch { setMsg("Could not submit review."); }
  }

  return (
    <div className="card" style={{ padding: "1.6rem", marginTop: "1.4rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: ".6rem" }}>
        <h3 style={{ margin: 0 }}>Ratings & Reviews</h3>
        {ready && user && (
          <button className={`btn ${fav ? "btn-primary" : "btn-ghost"} sm`} onClick={toggleFav}>
            {fav ? "❤️ Saved" : "🤍 Save to favorites"}
          </button>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: ".6em", margin: ".6rem 0 1rem" }}>
        <Stars value={game.rating_avg} size={20} />
        <b>{game.rating_avg || "—"}</b>
        <span className="muted small">({game.rating_count} review{game.rating_count === 1 ? "" : "s"})</span>
      </div>

      {ready && user ? (
        <form onSubmit={submitReview} style={{ marginBottom: "1.2rem" }}>
          {msg && <div className="alert ok small">{msg}</div>}
          <div className="field-row" style={{ marginBottom: ".5rem" }}>
            <span className="muted small">Your rating:</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button type="button" key={n} onClick={() => setRating(n)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.4rem", color: n <= rating ? "#F5C542" : "#3a3f52" }}>★</button>
            ))}
          </div>
          <textarea rows="2" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Share your experience…" />
          <button className="btn btn-primary sm" style={{ marginTop: ".4rem" }}>Submit Review</button>
        </form>
      ) : (
        <p className="muted small"><Link href="/login" className="gold">Sign in</Link> to rate this game.</p>
      )}

      <div style={{ display: "grid", gap: ".7rem" }}>
        {reviews.map((r) => (
          <div key={r.id} style={{ borderTop: "1px solid var(--line)", paddingTop: ".7rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <b>{r.user_name}</b><Stars value={r.rating} />
            </div>
            <p className="muted small" style={{ margin: ".2rem 0 0" }}>{r.comment}</p>
          </div>
        ))}
        {!reviews.length && <p className="muted small">No reviews yet — be the first!</p>}
      </div>
    </div>
  );
}
