import { getJSONSafe } from "../../lib/api";
import JsonLd from "../../components/JsonLd";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "FAQ — Frequently Asked Questions",
  description: "Answers about accounts, loading balance, cashouts, games and bonuses at Tiffany Gaming.",
};

export default async function FAQPage() {
  const faqs = await getJSONSafe("/faqs/", []);
  return (
    <section className="wrap section narrow">
      {faqs.length > 0 && (
        <JsonLd data={{
          "@context": "https://schema.org", "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question", name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }} />
      )}
      <div className="head"><div><span className="kicker">Help Center</span><h2>❓ Frequently Asked Questions</h2></div></div>
      {faqs.length ? faqs.map((f) => (
        <details key={f.id} className="faq"><summary>{f.question}</summary><p>{f.answer}</p></details>
      )) : <p className="muted">No FAQs yet.</p>}
    </section>
  );
}
