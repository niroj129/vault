export default function manifest() {
  return {
    name: "Tiffany Gaming",
    short_name: "Tiffany",
    description: "Premium sweepstakes & social casino hub — Juwa, Game Vault, Orion Stars and more.",
    start_url: "/",
    display: "standalone",
    background_color: "#05060E",
    theme_color: "#8B5CF6",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
