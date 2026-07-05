import Link from "next/link";
import { getJSONSafe } from "../../lib/api";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Promotions & Bonuses",
  description: "Current Tiffany Gaming promotions, bonus codes and cashback offers for Juwa, Game Vault, Orion Stars and more.",
};

export default async function Promotions() {
  const promos = await getJSONSafe("/promos/", []);
  return (
    <section className="wrap section">
      <div className="head"><div><span className="kicker">Offers</span><h2>🎁 Promotions & Bonuses</h2></div></div>
      {promos.length ? (
        <div className="promo-grid">
          {promos.map((p) => (
            <div key={p.id} className="promo-card">
              <h3>{p.title}</h3>
              <p className="muted">{p.description}</p>
              {p.code && <div className="promo-code">CODE: {p.code}</div>}
              {p.expires && <p className="muted small" style={{ marginTop: ".6rem" }}>Expires {p.expires}</p>}
              <div style={{ marginTop: "1rem" }}><Link href="/chat" className="btn btn-primary sm">Claim via Chat</Link></div>
            </div>
          ))}
        </div>
      ) : <div className="empty"><span className="emoji">🎁</span><p>No active promotions right now — check back soon!</p></div>}
    </section>
  );
}
