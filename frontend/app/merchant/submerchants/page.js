"use client";

import { useEffect, useState } from "react";
import Crud from "../../../components/admin/Crud";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";

const money = (c) => `$${(Number(c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function SubMerchants() {
  const { token } = useAuth();
  const [me, setMe] = useState(null);
  useEffect(() => { apiFetch("/merchants/me/", { token }).then(setMe).catch(() => {}); }, [token]);

  return (
    <div>
      <div className="card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <p className="muted small" style={{ margin: 0 }}>
          Create sub-merchants under you. Their fee % must be <b>at least your own ({me?.fee_percent ?? "…"}%)</b> —
          you keep the margin between their fee and yours on every order they process.
        </p>
      </div>
      <Crud
        title="Sub-Merchants" addLabel="Add Sub-Merchant" endpoint="/merchants/"
        columns={[
          { key: "name", label: "Name", render: (r) => <b>{r.name}</b> },
          { key: "code", label: "Code" },
          { key: "login", label: "Login" },
          { key: "fee_percent", label: "Fee %", render: (r) => `${r.fee_percent}%` },
          { key: "collected", label: "Collected", render: (r) => money(r.stats?.gross) },
          { key: "your_cut", label: "Your Cut", render: (r) => <span className="gold">{money(r.stats?.parent)}</span> },
          { key: "active", label: "Status", render: (r) => <span className={`badge ${r.active ? "ok" : "off"}`}>{r.active ? "active" : "off"}</span> },
        ]}
        fields={[
          { name: "name", label: "Business Name", required: true },
          { name: "username", label: "Login Username", required: true },
          { name: "password", label: "Password", help: "leave blank on edit to keep", full: true },
          { name: "fee_percent", label: `Fee % (min ${me?.fee_percent ?? 0})`, type: "number", required: true },
          { name: "active", label: "Active", type: "checkbox" },
        ]}
        defaults={{ active: true, fee_percent: me?.fee_percent || 0 }}
      />
    </div>
  );
}
