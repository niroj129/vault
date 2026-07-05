import { SITE_URL } from "../lib/api";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/dashboard", "/chat", "/login", "/search"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
