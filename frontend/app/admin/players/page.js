"use client";

import { useState } from "react";
import Crud from "../../../components/admin/Crud";
import ExportButton from "../../../components/admin/ExportButton";
import PingModal from "../../../components/admin/PingModal";

export default function AdminPlayers() {
  const [ping, setPing] = useState(null);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: ".6rem" }}><ExportButton resource="players" label="Export Players" /></div>
      <Crud
        title="Players" addLabel="Create Account" endpoint="/users/"
        searchKeys={["username", "full_name", "email", "phone"]}
        columns={[
          { key: "username", label: "Username", render: (r) => <b>{r.username}</b> },
          { key: "full_name", label: "Name" },
          { key: "email", label: "Email", render: (r) => r.email || "—" },
          { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
          { key: "vip_tier", label: "Tier", render: (r) => r.role === "user" ? <span className={`tier ${r.vip_tier}`}>{r.vip_tier}</span> : "—" },
          { key: "loyalty_points", label: "Points" },
          { key: "role", label: "Role", render: (r) => <span className={`badge ${r.role === "admin" ? "gold" : ""}`}>{r.role}</span> },
          { key: "is_active", label: "Status", render: (r) => <span className={`badge ${r.is_active ? "ok" : "off"}`}>{r.is_active ? "active" : "disabled"}</span> },
          { key: "ping", label: "", render: (r) => r.role === "user" ? <button className="btn btn-secondary sm" title="Hit up player by email/SMS" onClick={(e) => { e.stopPropagation(); setPing(r); }}>📣 Hit Up</button> : null },
        ]}
        fields={[
          { name: "username", label: "Username", required: true },
          { name: "full_name", label: "Full Name" },
          { name: "email", label: "Email", type: "email" },
          { name: "phone", label: "Phone" },
          { name: "role", label: "Role", type: "select", options: [{ value: "user", label: "Player / User" }, { value: "admin", label: "Admin" }] },
          { name: "password", label: "Password", help: "leave blank on edit to keep", full: true },
          { name: "is_active", label: "Active", type: "checkbox" },
        ]}
        defaults={{ role: "user", is_active: true }}
      />
      {ping && <PingModal player={ping} onClose={() => setPing(null)} />}
    </div>
  );
}
