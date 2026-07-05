"use client";

import Crud from "../../../components/admin/Crud";

export default function AdminAnnouncements() {
  return (
    <Crud
      title="Announcements" addLabel="New Announcement" endpoint="/announcements/"
      columns={[
        { key: "title", label: "Title", render: (r) => <b>{r.title}</b> },
        { key: "pinned", label: "Pinned", render: (r) => r.pinned ? "📌" : "—" },
        { key: "active", label: "Status", render: (r) => <span className={`badge ${r.active ? "ok" : "off"}`}>{r.active ? "active" : "hidden"}</span> },
        { key: "created_at", label: "Created", render: (r) => (r.created_at || "").slice(0, 10) },
      ]}
      fields={[
        { name: "title", label: "Title", required: true, full: true },
        { name: "body", label: "Message", type: "textarea", full: true },
        { name: "pinned", label: "Pin to top", type: "checkbox" },
        { name: "active", label: "Active", type: "checkbox" },
      ]}
      defaults={{ active: true, pinned: false }}
    />
  );
}
