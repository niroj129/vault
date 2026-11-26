/** @type {import('next').NextConfig} */
// Django, reached from the Next.js server. In production nginx/Caddy send
// /api, /media and /ws straight to Django; these rewrites make `next dev`
// (and a bare `next start`) behave the same, preserving the site's Host.
const backend = (process.env.INTERNAL_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // the link-preview route reads these at runtime
  outputFileTracingIncludes: { "/og": ["./assets/fonts/**"] },
  // Django routes end in "/" — don't let Next strip it
  skipTrailingSlashRedirect: true,
  images: {
    // game art and uploads come from Django's /media (same origin via the rewrite below)
    localPatterns: [{ pathname: "/media/**" }, { pathname: "/icon.svg" }],
    remotePatterns: [{ protocol: "https", hostname: "**" }, { protocol: "http", hostname: "**" }],
  },
  async rewrites() {
    return [
      { source: "/api/:path*/", destination: `${backend}/api/:path*/` },
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/media/:path*", destination: `${backend}/media/:path*` },
      { source: "/django-admin/:path*", destination: `${backend}/django-admin/:path*` },
      { source: "/static/:path*", destination: `${backend}/static/:path*` },
    ];
  },
};

export default nextConfig;
