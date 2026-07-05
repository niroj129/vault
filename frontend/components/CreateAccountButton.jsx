"use client";

import { useEffect, useState } from "react";
import { getJSONSafe } from "../lib/api";

// module-level cache so we only fetch the signup URL once per session
let cachedUrl = null;
const FALLBACK = "https://www.facebook.com/profile.php?id=61572215053137";

export default function CreateAccountButton({
  className = "btn btn-primary", label = "➕ Create Account", style,
}) {
  const [url, setUrl] = useState(cachedUrl);
  useEffect(() => {
    if (cachedUrl) return;
    getJSONSafe("/settings/", {}).then((s) => {
      cachedUrl = s.signup_url || FALLBACK;
      setUrl(cachedUrl);
    });
  }, []);
  return (
    <a href={url || FALLBACK} target="_blank" rel="noopener noreferrer"
      className={className} style={style}>
      {label}
    </a>
  );
}
