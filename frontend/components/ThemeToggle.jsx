"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("theme");
    const saved = param ? param === "light" : localStorage.getItem("tf_theme") === "light";
    if (param) localStorage.setItem("tf_theme", param);
    setLight(saved);
    document.body.classList.toggle("light", saved);
  }, []);
  function toggle() {
    const next = !light;
    setLight(next);
    document.body.classList.toggle("light", next);
    localStorage.setItem("tf_theme", next ? "light" : "dark");
  }
  return <button className="icon-btn2" onClick={toggle} title="Toggle theme" aria-label="Toggle theme">{light ? "🌙" : "☀️"}</button>;
}
