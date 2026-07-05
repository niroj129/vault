import { getJSONSafe } from "../lib/api";

export default async function WinnerTicker() {
  const winners = await getJSONSafe("/winners/", []);
  if (!winners.length) return null;
  const items = [...winners.slice(0, 12), ...winners.slice(0, 12)];
  return (
    <div className="ticker" aria-label="Recent winners">
      <span className="ticker-label">🏆 LIVE WINS</span>
      <div className="ticker-track">
        {items.map((w, i) => (
          <span className="ticker-item" key={i}>
            <b>{w.name}</b> won <span className="gold">${Number(w.amount).toLocaleString()}</span>
            {w.game ? ` on ${w.game}` : ""} <span className="dot-sep">•</span>
          </span>
        ))}
      </div>
    </div>
  );
}
