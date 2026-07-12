import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment Status", robots: { index: false } };

const MAP = {
  succeeded: { icon: "✅", title: "Payment Successful", msg: "Your payment went through. You can close this page." },
  failed: { icon: "❌", title: "Payment Failed", msg: "The payment didn't complete. Please try again or contact your agent." },
  processing: { icon: "⏳", title: "Payment Processing", msg: "Your payment is being processed. This can take a moment." },
};

export default async function PayReturn({ searchParams }) {
  const sp = await searchParams;
  const status = (sp?.status || "processing").toLowerCase();
  const info = MAP[status] || MAP.processing;
  const amount = sp?.amount ? `$${(Number(sp.amount) / 100).toFixed(2)}` : null;

  return (
    <section className="auth-wrap">
      <div className="auth-card center">
        <div style={{ fontSize: "3.5rem" }}>{info.icon}</div>
        <h1 style={{ fontSize: "1.5rem", margin: ".4rem 0" }}>{info.title}</h1>
        {amount && <p className="gold" style={{ fontSize: "1.6rem", fontWeight: 800 }}>{amount}</p>}
        <p className="muted">{info.msg}</p>
        {sp?.mchOrderNo && <p className="muted small">Ref: {sp.mchOrderNo}</p>}
        <Link href="/" className="btn btn-primary" style={{ marginTop: "1rem" }}>Back to Home</Link>
      </div>
    </section>
  );
}
