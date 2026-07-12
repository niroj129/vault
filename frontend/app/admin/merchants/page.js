"use client";

import Crud from "../../../components/admin/Crud";

const money = (c) => `$${(Number(c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function AdminMerchants() {
  return (
    <div>
      <div className="card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <p className="muted small" style={{ margin: 0 }}>
          Create tier-1 merchants. Their fee % is the platform's cut you keep on their orders.
          Tier-1 merchants can create their own sub-merchants (each with a fee ≥ their own).
        </p>
      </div>
      <Crud
        title="Merchants" addLabel="Add Merchant" endpoint="/merchants/"
        searchKeys={["name", "code", "login"]}
        columns={[
          { key: "name", label: "Name", render: (r) => <b>{r.name}</b> },
          { key: "code", label: "Code" },
          { key: "login", label: "Login" },
          { key: "is_sub", label: "Tier", render: (r) => r.is_sub ? <span className="badge">sub · {r.parent_name}</span> : <span className="badge gold">tier-1</span> },
          { key: "fee_percent", label: "Fee %", render: (r) => `${r.fee_percent}%` },
          { key: "subs", label: "Subs", render: (r) => r.stats?.submerchants ?? 0 },
          { key: "gross", label: "Collected", render: (r) => money(r.stats?.gross) },
          { key: "platform", label: "Your Cut", render: (r) => <span className="gold">{money(r.stats?.platform)}</span> },
          { key: "active", label: "Status", render: (r) => <span className={`badge ${r.active ? "ok" : "off"}`}>{r.active ? "active" : "off"}</span> },
        ]}
        fields={[
          { name: "name", label: "Business Name", required: true },
          { name: "username", label: "Login Username", required: true },
          { name: "password", label: "Password", help: "leave blank on edit to keep", full: true },
          { name: "fee_percent", label: "Platform Fee % (your cut)", type: "number", required: true },
          { name: "active", label: "Active", type: "checkbox" },
        ]}
        defaults={{ active: true, fee_percent: 0 }}
      />
    </div>
  );
}
