import Link from "next/link";
import { getJSONSafe } from "../../lib/api";
import GameCard from "../../components/GameCard";

export const revalidate = 60;

export const metadata = {
  title: "All Games",
  description: "Browse every sweepstakes and social casino game on Tiffany Gaming — Juwa, Game Vault, Orion Stars, Fire Kirin and more.",
};

export default async function GamesPage({ searchParams }) {
  const sp = await searchParams;
  const q = sp?.q || "";
  const category = sp?.category || "";
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (category) query.set("category", category);

  const [games, categories] = await Promise.all([
    getJSONSafe(`/games/?${query.toString()}`, []),
    getJSONSafe("/categories/", []),
  ]);

  return (
    <section className="wrap section">
      <div className="head"><div><span className="kicker">Full Library</span><h2>All Games</h2></div></div>

      <form className="searchbar" action="/games" style={{ marginBottom: "1.4rem" }}>
        {category && <input type="hidden" name="category" value={category} />}
        <input name="q" defaultValue={q} placeholder="Search games…" />
        <button className="btn btn-secondary" type="submit">Search</button>
      </form>

      <div style={{ display: "flex", gap: ".6em", flexWrap: "wrap", marginBottom: "1.6rem" }}>
        <Link href="/games" className={`tag ${!category ? "" : ""}`} style={pill(!category)}>All</Link>
        {categories.map((c) => (
          <Link key={c.id} href={`/games?category=${c.slug}`} style={pill(category === c.slug)}>{c.name}</Link>
        ))}
      </div>

      {q && <p className="muted">Results for “{q}” — {games.length} found.</p>}

      <div className="grid games">
        {games.length ? games.map((g) => <GameCard key={g.id} game={g} />)
          : <div className="empty"><span className="emoji">👻</span><p>No games match your search.</p></div>}
      </div>
    </section>
  );
}

function pill(active) {
  return {
    padding: ".5em 1em", borderRadius: "999px", fontSize: ".85rem",
    background: active ? "var(--accent)" : "var(--surface)",
    color: active ? "var(--accent-ink)" : "var(--muted)",
    border: active ? "none" : "1px solid var(--line)", fontWeight: 700,
  };
}
