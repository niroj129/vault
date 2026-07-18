/* Reusable skeleton loaders — shimmer feedback during async loads. */

export function Skeleton({ w = "100%", h = 12, r, style }) {
  return <span className="skeleton" style={{ display: "block", width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

/** Grid of widget-card skeletons (dashboards). */
export function WidgetSkeleton({ count = 4 }) {
  return (
    <div className="wgrid" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="wcard">
          <span className="skeleton" style={{ width: 50, height: 50, borderRadius: 12, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <Skeleton w="60%" h={18} />
            <Skeleton w="40%" h={11} style={{ marginTop: 8 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Table-row skeletons. */
export function TableSkeleton({ rows = 6, cols = 4 }) {
  return (
    <div className="card" style={{ padding: "1rem" }} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="sk-row" style={{ padding: ".6em 0" }}>
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} w={j === 0 ? "22%" : `${18 + (j % 3) * 6}%`} h={14} />
          ))}
        </div>
      ))}
    </div>
  );
}
