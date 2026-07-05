"use client";

import { apiFetch } from "../lib/api";
import CreateAccountButton from "./CreateAccountButton";

export default function PlayButtons({ game }) {
  async function play() {
    try {
      const { url } = await apiFetch(`/games/${game.slug}/click/`, { method: "POST" });
      window.open(url || game.user_link || game.play_url, "_blank", "noopener");
    } catch {
      window.open(game.user_link || game.play_url, "_blank", "noopener");
    }
  }

  const hasLink = game.user_link || game.play_url;

  return (
    <div className="link-row">
      <CreateAccountButton className="btn btn-primary lg" label="🆕 Create Account" />
      {hasLink && (
        <button className="btn btn-secondary lg" onClick={play}>▶ Open Game Link</button>
      )}
    </div>
  );
}
