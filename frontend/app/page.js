import Link from "next/link";
import { getJSONSafe, mediaUrl, SITE_URL } from "../lib/api";
import GameCard from "../components/GameCard";
import JsonLd from "../components/JsonLd";
import WinnerTicker from "../components/WinnerTicker";
import TrustBadges from "../components/TrustBadges";
import RecentlyViewed from "../components/RecentlyViewed";

const EMOJI = {
  fish: "🐟", slot: "🎰", arcade: "🕹️", ticket: "🎟️", video: "🎥",
  grid: "🔢", dice: "🎲",
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const [featured, fresh, popular, all, categories, announcements, stats] =
    await Promise.all([
      getJSONSafe("/games/?featured=1", []),
      getJSONSafe("/games/?is_new=1", []),
      getJSONSafe("/games/?ordering=popular", []),
      getJSONSafe("/games/", []),
      getJSONSafe("/categories/", []),
      getJSONSafe("/announcements/", []),
      getJSONSafe("/stats/public/", { profit: {}, active_games: 0 }),
    ]);
  const winner = stats.latest_winner;
  const p = stats.profit || {};

  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "Organization",
        name: "Tiffany Gaming", url: SITE_URL,
        description: "Premium sweepstakes & social casino hub.",
        slogan: "Keep playing, keep winning.",
      }} />

      <section className="hero wrap">
        <div className="hero-grid">
          <div>
            <span className="pill">✦ Premium Sweepstakes Platform</span>
            <h1 className="display">Play the best <span className="grad">sweepstakes games</span> in one place</h1>
            <p className="lead">
              Juwa, Game Vault, Orion Stars, Fire Kirin & more — with instant game
              links, verified agents and 24/7 support. Keep playing, keep winning.
            </p>
            <div className="hero-cta">
              <Link href="/games" className="btn btn-primary lg">Browse Games →</Link>
              <Link href="/chat" className="btn btn-ghost lg">💬 Chat with an Agent</Link>
            </div>
            <form className="searchbar" action="/search">
              <input name="q" placeholder="Search games, categories…" aria-label="Search" />
              <button className="btn btn-secondary" type="submit">Search</button>
            </form>
          </div>
          <div className="hero-stats">
            <div className="stat"><span className="label">Today's Profit</span><span className="value">${fmt(p.today)}</span></div>
            <div className="stat"><span className="label">Weekly Profit</span><span className="value">${fmt(p.week)}</span></div>
            <div className="stat"><span className="label">Monthly Profit</span><span className="value">${fmt(p.month)}</span></div>
            <div className="stat violet"><span className="label">Active Games</span><span className="value">{stats.active_games}</span></div>
          </div>
        </div>
      </section>

      <WinnerTicker />
      <TrustBadges />

      {winner && (
        <section className="wrap"><div className="winner-banner">
          <div className="winner-photo">{winner.photo ? <img src={mediaUrl(winner.photo)} alt={winner.name} /> : "🏆"}</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <span className="pill pill-solid">Daily Winner</span>
            <h3 style={{ margin: ".3em 0" }}>{winner.name}</h3>
            <p className="muted">won <b className="gold">${fmt(winner.amount)}</b>{winner.game ? ` on ${winner.game}` : ""} · {winner.win_date}</p>
          </div>
          <Link href="/winners" className="btn btn-ghost">All Winners</Link>
        </div></section>
      )}

      {announcements.length > 0 && (
        <section className="wrap section">
          <div className="head"><div><span className="kicker">Latest</span><h2>Announcements & Promotions</h2></div></div>
          <div className="ann-strip">
            {announcements.map((a) => (
              <div key={a.id} className={`ann ${a.pinned ? "pinned" : ""}`}>
                {a.pinned && <span className="tag">📌 Pinned</span>}
                <h4 style={{ marginTop: ".4em" }}>{a.title}</h4>
                <p className="muted small">{a.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="wrap section">
        <div className="head"><div><span className="kicker">Explore</span><h2>Game Categories</h2></div></div>
        <div className="grid cats">
          {categories.map((c) => (
            <Link key={c.id} href={`/games?category=${c.slug}`} className="cat-card">
              <span className="emoji">{EMOJI[c.icon] || "🎲"}</span>
              <b>{c.name}</b><small>{c.game_count} games</small>
            </Link>
          ))}
        </div>
      </section>

      <GameSection title="Featured Games" kicker="Hand-picked" games={featured} />
      <GameSection title="New Games" kicker="Just Added" games={fresh} />
      <GameSection title="Popular Games" kicker="Trending" games={popular} />
      <GameSection title="All Games" kicker="Full Library" games={all} seeAll />

      <RecentlyViewed />

      <section className="wrap section"><div className="cta-band">
        <div>
          <h2 className="display">Need help or a game link?</h2>
          <p className="muted">Our agents are online 24/7 in live chat to get you playing in minutes.</p>
        </div>
        <Link href="/chat" className="btn btn-primary lg">💬 Chat with an Agent</Link>
      </div></section>
    </>
  );
}

function GameSection({ title, kicker, games, seeAll }) {
  if (!games?.length) return null;
  return (
    <section className="wrap section">
      <div className="head">
        <div><span className="kicker">{kicker}</span><h2>{title}</h2></div>
        {seeAll && <Link href="/games" className="link-all">See all →</Link>}
      </div>
      <div className="grid games">
        {games.slice(0, 8).map((g) => <GameCard key={g.id} game={g} />)}
      </div>
    </section>
  );
}

function fmt(v) {
  return Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
