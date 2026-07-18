"use client";

// Re-mounts on every navigation → gives a smooth enter animation to every page.
export default function Template({ children }) {
  return <div className="page-enter">{children}</div>;
}
