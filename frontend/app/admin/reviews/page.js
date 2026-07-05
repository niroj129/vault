"use client";

import Crud from "../../../components/admin/Crud";
import Stars from "../../../components/Stars";

export default function AdminReviews() {
  return (
    <div>
      <p className="muted small" style={{ marginBottom: "1rem" }}>Moderate player reviews. Delete removes a review from the game page.</p>
      <Crud
        title="Reviews" endpoint="/reviews/" canAdd={false} canEdit={false}
        columns={[
          { key: "game_slug", label: "Game", render: (r) => <b>{r.game_slug}</b> },
          { key: "user_name", label: "Player" },
          { key: "rating", label: "Rating", render: (r) => <Stars value={r.rating} /> },
          { key: "comment", label: "Comment", render: (r) => <span className="muted small">{r.comment}</span> },
          { key: "created_at", label: "Date", render: (r) => (r.created_at || "").slice(0, 10) },
        ]}
        fields={[]}
      />
    </div>
  );
}
