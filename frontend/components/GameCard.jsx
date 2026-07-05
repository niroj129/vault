import Link from "next/link";
import { mediaUrl } from "../lib/api";
import Stars from "./Stars";

export default function GameCard({ game }) {
  const img = mediaUrl(game.thumbnail || game.logo);
  return (
    <article className="card game-card">
      <Link href={`/${game.slug}`} className="thumb">
        {img ? (
          <img src={img} alt={`${game.name} logo`} loading="lazy" />
        ) : (
          <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: "2rem" }}>🎰</div>
        )}
        {game.featured ? <span className="ribbon">Featured</span>
          : game.is_new ? <span className="ribbon new">New</span> : null}
        <span className={`dot ${game.status === "active" ? "on" : "off"}`} />
      </Link>
      <div className="game-body">
        <h3><Link href={`/${game.slug}`}>{game.name}</Link></h3>
        <div style={{ display: "flex", alignItems: "center", gap: ".4em", justifyContent: "space-between" }}>
          {game.category_name ? <span className="tag">{game.category_name}</span> : <span />}
          {game.rating_count > 0 && <span style={{ display: "flex", alignItems: "center", gap: ".2em" }}><Stars value={game.rating_avg} size={12} /><span className="muted" style={{ fontSize: ".7rem" }}>{game.rating_avg}</span></span>}
        </div>
        <p>{game.short_description}</p>
        <div className="game-actions">
          <Link href={`/${game.slug}`} className="btn btn-primary sm">View</Link>
        </div>
      </div>
    </article>
  );
}
