import Link from "next/link";
import { notFound } from "next/navigation";
import { getJSONSafe, mediaUrl, SITE_URL } from "../../lib/api";
import GameCard from "../../components/GameCard";
import JsonLd from "../../components/JsonLd";
import PlayButtons from "../../components/PlayButtons";
import GameSocial from "../../components/GameSocial";
import RecordView from "../../components/RecordView";
import CreateAccountButton from "../../components/CreateAccountButton";

export const revalidate = 60;

async function getGame(slug) {
  return getJSONSafe(`/games/${slug}/`, null, { revalidate: 60 });
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) return { title: "Game not found" };
  const title = game.meta_title || `${game.name} — Download, Login & Play`;
  const description = game.meta_description || game.short_description ||
    `Play ${game.name} online. Get the user link, agent info and FAQs.`;
  const image = mediaUrl(game.banner || game.thumbnail || game.logo);
  return {
    title, description,
    keywords: game.meta_keywords,
    alternates: { canonical: `${SITE_URL}/${game.slug}` },
    openGraph: {
      title, description, url: `${SITE_URL}/${game.slug}`, type: "article",
      images: image ? [{ url: image }] : [],
    },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : [] },
  };
}

export default async function GameLanding({ params }) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) notFound();

  const related = await getJSONSafe(
    `/games/?category=${game.category_slug}`, []);
  const relatedGames = related.filter((g) => g.slug !== game.slug).slice(0, 4);

  const url = `${SITE_URL}/${game.slug}`;
  const img = mediaUrl(game.banner || game.thumbnail || game.logo);

  return (
    <>
      <RecordView slug={game.slug} name={game.name} thumbnail={game.thumbnail} />
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Games", item: `${SITE_URL}/games` },
          { "@type": "ListItem", position: 3, name: game.name, item: url },
        ],
      }} />
      {game.faqs?.length > 0 && (
        <JsonLd data={{
          "@context": "https://schema.org", "@type": "FAQPage",
          mainEntity: game.faqs.map((f) => ({
            "@type": "Question", name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }} />
      )}
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "VideoGame",
        name: game.name, description: game.meta_description || game.short_description,
        url, image: img, genre: game.category_name || "Casino",
        applicationCategory: "Game", operatingSystem: "Android, iOS, Web",
        ...(game.rating_count > 0 ? {
          aggregateRating: {
            "@type": "AggregateRating", ratingValue: game.rating_avg,
            reviewCount: game.rating_count, bestRating: 5,
          },
        } : {}),
      }} />

      <div className="wrap">
        <nav className="crumb">
          <Link href="/">Home</Link> › <Link href="/games">Games</Link> › <span>{game.name}</span>
        </nav>
      </div>

      <section className="wrap section" style={{ paddingTop: "1.2rem" }}>
        {game.banner && (
          <div className="landing-banner"><img src={mediaUrl(game.banner)} alt={`${game.name} banner`} /></div>
        )}
        <div className="landing-hero">
          <div className="landing-logo">
            {game.logo ? <img src={mediaUrl(game.logo)} alt={`${game.name} logo`} />
              : <div style={{ height: 300, display: "grid", placeItems: "center", fontSize: "3rem" }}>🎰</div>}
          </div>
          <div className="landing-info">
            <div className="badge-row">
              {game.category_name && <Link href={`/games?category=${game.category_slug}`} className="tag">{game.category_name}</Link>}
              {game.is_new && <span className="tag new">New</span>}
              <span className="pill">{game.status === "active" ? "🟢 Live" : "⚫ Offline"}</span>
            </div>
            <h1 className="display">{game.name}</h1>
            <p className="muted">{game.description || game.short_description}</p>
            <PlayButtons game={game} />
            <p className="muted small">🔥 {game.clicks} plays · 👁 {game.views} views</p>
          </div>
        </div>

        <div className="landing-cols">
          <div>
            {game.features_list?.length > 0 && (
              <div className="card" style={{ padding: "1.6rem", marginBottom: "1.4rem" }}>
                <h3>Features</h3>
                <ul className="feature-list">{game.features_list.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
            )}
            {game.download_info && (
              <div className="card" style={{ padding: "1.6rem", marginBottom: "1.4rem" }}>
                <h3>Download & Access</h3><p className="muted">{game.download_info}</p>
              </div>
            )}
            {game.screenshots?.length > 0 && (
              <div className="card" style={{ padding: "1.6rem", marginBottom: "1.4rem" }}>
                <h3>Screenshots</h3>
                <div className="shots">{game.screenshots.map((s) => <img key={s.id} src={mediaUrl(s.image)} alt={s.alt} loading="lazy" />)}</div>
              </div>
            )}
            {game.faqs?.length > 0 && (
              <div className="card" style={{ padding: "1.6rem" }}>
                <h3>Frequently Asked Questions</h3>
                {game.faqs.map((f) => (
                  <details key={f.id} className="faq"><summary>{f.question}</summary><p>{f.answer}</p></details>
                ))}
              </div>
            )}
            <GameSocial game={game} />
          </div>
          <aside>
            <div className="card" style={{ padding: "1.6rem", position: "sticky", top: "88px" }}>
              <h3>Get Started</h3>
              <p className="muted small">Create your account in seconds — no login required. We'll get you playing right away.</p>
              <CreateAccountButton className="btn btn-primary full" style={{ marginTop: ".6rem" }} label="🆕 Create Account" />
            </div>
          </aside>
        </div>

        {relatedGames.length > 0 && (
          <>
            <div className="head" style={{ marginTop: "2.5rem" }}><h2>Related Games</h2></div>
            <div className="grid games">{relatedGames.map((g) => <GameCard key={g.id} game={g} />)}</div>
          </>
        )}
      </section>
    </>
  );
}
