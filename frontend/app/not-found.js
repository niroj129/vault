import Link from "next/link";

export default function NotFound() {
  return (
    <section className="wrap section">
      <div className="empty">
        <div className="err-code">404</div>
        <p>That page or game could not be found.</p>
        <Link href="/" className="btn btn-primary">Back home</Link>
      </div>
    </section>
  );
}
