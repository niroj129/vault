export default function TrustBadges() {
  const badges = [
    ["🔒", "Secure & Encrypted"],
    ["⚡", "Instant Loads"],
    ["🎧", "24/7 Live Support"],
    ["✅", "Verified Agents"],
    ["🎁", "Daily Bonuses"],
  ];
  return (
    <div className="trust wrap">
      <span className="legit-stamp">LEGIT</span>
      {badges.map(([e, t]) => (
        <span className="trust-badge" key={t}><span className="em">{e}</span> {t}</span>
      ))}
    </div>
  );
}
