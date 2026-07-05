import { getJSONSafe, mediaUrl } from "../../lib/api";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Daily Winners",
  description: "See the latest big winners at Tiffany Gaming across Juwa, Game Vault, Orion Stars and more.",
};

export default async function WinnersPage() {
  const winners = await getJSONSafe("/winners/", []);
  return (
    <section className="wrap section">
      <div className="head"><div><span className="kicker">Hall of Fame</span><h2>🏆 Winners</h2></div></div>
      {winners.length ? (
        <div className="winner-grid">
          {winners.map((w, i) => (
            <div key={w.id} className={`winner-card ${i === 0 ? "top" : ""}`}>
              {i === 0 && <span className="pill pill-solid">Latest</span>}
              <div className="winner-photo">{w.photo ? <img src={mediaUrl(w.photo)} alt={w.name} /> : "🏆"}</div>
              <b>{w.name}</b>
              <div className="win-amt">${Number(w.amount).toLocaleString()}</div>
              {w.game && <span className="tag">{w.game}</span>}
              <small className="muted">{w.win_date}</small>
            </div>
          ))}
        </div>
      ) : <div className="empty"><span className="emoji">🏆</span><p>No winners yet.</p></div>}
    </section>
  );
}
