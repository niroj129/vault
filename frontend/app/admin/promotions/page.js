"use client";

import Crud from "../../../components/admin/Crud";

export default function AdminPromotions() {
  return (
    <Crud
      title="Promotions" addLabel="New Promotion" endpoint="/promos/"
      columns={[
        { key: "title", label: "Title", render: (r) => <b>{r.title}</b> },
        { key: "code", label: "Code", render: (r) => r.code ? <span className="badge gold">{r.code}</span> : "—" },
        { key: "active", label: "Status", render: (r) => <span className={`badge ${r.active ? "ok" : "off"}`}>{r.active ? "active" : "hidden"}</span> },
        { key: "expires", label: "Expires", render: (r) => r.expires || "—" },
      ]}
      fields={[
        { name: "title", label: "Title", required: true, full: true },
        { name: "code", label: "Bonus Code" },
        { name: "expires", label: "Expires", type: "date" },
        { name: "description", label: "Description", type: "textarea", full: true },
        { name: "image", label: "Image", type: "file", full: true },
        { name: "sort_order", label: "Sort order", type: "number" },
        { name: "active", label: "Active", type: "checkbox" },
      ]}
      defaults={{ active: true, sort_order: 0 }}
    />
  );
}
