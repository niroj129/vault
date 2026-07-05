import Link from "next/link";
import Logo from "./Logo";
import CreateAccountButton from "./CreateAccountButton";

export default function Footer({ business }) {
  const b = business || {};
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-cta">
          <div>
            <h2 className="display">Ready to play? Create your account now</h2>
            <p className="muted">Join in seconds — no login needed. Instant access to Juwa, Game Vault, Orion Stars & more.</p>
          </div>
          <CreateAccountButton className="btn btn-primary lg" label="🆕 Create Account" />
        </div>
      </div>
      <div className="wrap footer-grid">
        <div>
          <div className="brand"><Logo size={38} /><span className="brand-name">TIFFANY <b>GAMING</b></span></div>
          <p className="muted small" style={{ marginTop: ".8rem" }}>
            Keep playing, keep winning — your journey to success starts with each bet.
          </p>
        </div>
        <div>
          <h4>Explore</h4>
          <Link href="/games">Games</Link>
          <Link href="/winners">Winners</Link>
          <Link href="/search">Search</Link>
        </div>
        <div>
          <h4>Company</h4>
          <Link href="/business">Contact</Link>
          <Link href="/business#terms">Terms</Link>
          <Link href="/business#privacy">Privacy</Link>
        </div>
        <div>
          <h4>Connect</h4>
          <div className="socials">
            {b.facebook && <a href={b.facebook} aria-label="Facebook">📘</a>}
            {b.instagram && <a href={b.instagram} aria-label="Instagram">📸</a>}
            {b.telegram && <a href={b.telegram} aria-label="Telegram">✈️</a>}
          </div>
          <p className="muted small">{b.email}</p>
        </div>
      </div>
      <div className="footer-bottom">
        © {new Date().getFullYear()} {b.business_name || "Tiffany Gaming"}. Play responsibly. 18+ only.
      </div>
    </footer>
  );
}
