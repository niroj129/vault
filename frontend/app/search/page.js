import Link from "next/link";
import { getJSONSafe } from "../../lib/api";
import GameCard from "../../components/GameCard";

export const metadata = { title: "Search", robots: { index: false } };

export default async function SearchPage({ searchParams }) {
  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const [games, categories, announcements] = q
    ? await Promise.all([
        getJSONSafe(`/games/?q=${encodeURIComponent(q)}`, []),
        getJSONSafe("/categories/", []),
        getJSONSafe("/announcements/", []),
      ])
    : [[], [], []];
  const cats = categories.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  const anns = announcements.filter(
    (a) => a.title.toLowerCase().includes(q.toLowerCase()) ||
           (a.body || "").toLowerCase().includes(q.toLowerCase()));

  return (
    <section className="wrap section">
      <div className="head"><div><span className="kicker">Find anything</span><h2>🔍 Search</h2></div></div>
      <form className="searchbar" action="/search" style={{ marginBottom: "1.6rem" }}>
        <input name="q" defaultValue={q} placeholder="Games, categories, news…" autoFocus />
        <button className="btn btn-secondary" type="submit">Search</button>
      </form>

      {q && (
        <>
          {games.length > 0 && (<><h3>Games</h3><div className="grid games" style={{ marginBottom: "2rem" }}>{games.map((g) => <GameCard key={g.id} game={g} />)}</div></>)}
          {cats.length > 0 && (<><h3>Categories</h3><div style={{ display: "flex", gap: ".6em", flexWrap: "wrap", marginBottom: "2rem" }}>{cats.map((c) => <Link key={c.id} href={`/games?category=${c.slug}`} className="tag">{c.name}</Link>)}</div></>)}
          {anns.length > 0 && (<><h3>News</h3><div className="ann-strip">{anns.map((a) => <div key={a.id} className="ann"><h4>{a.title}</h4><p className="muted small">{a.body}</p></div>)}</div></>)}
          {!games.length && !cats.length && !anns.length && <div className="empty"><span className="emoji">👻</span><p>Nothing found for “{q}”.</p></div>}
        </>
      )}
    </section>
  );
}
