"use client";

import { useEffect, useState } from "react";
import Crud from "../../../components/admin/Crud";
import ExportButton from "../../../components/admin/ExportButton";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";

const num = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function AdminPayments() {
  const { token } = useAuth();
  const [stats, setStats] = useState({ today_cashout: 0 });
  useEffect(() => { if (token) apiFetch("/stats/admin/", { token }).then(setStats).catch(() => {}); }, [token]);

  return (
    <div>
      <div className="wgrid">
        <div className="wcard gold"><div className="ic">💸</div><div><div className="v">${num(stats.today_cashout)}</div><div className="l">Cashout Today</div></div></div>
        <div className="wcard"><div className="ic">💰</div><div><div className="v">${num(stats.daily_profit)}</div><div className="l">Profit Today</div></div></div>
        <div className="wcard violet"><div className="ic">📈</div><div><div className="v">${num(stats.monthly_profit)}</div><div className="l">Profit This Month</div></div></div>
      </div>

      <h3 style={{ margin: "1.4rem 0 .8rem" }}>💳 Payment Methods</h3>
      <Crud
        title="Payment Methods" addLabel="Add Method" endpoint="/payment-methods/"
        columns={[
          { key: "name", label: "Method", render: (r) => <b>{r.name}</b> },
          { key: "details", label: "Details" },
          { key: "active", label: "Status", render: (r) => <span className={`badge ${r.active ? "ok" : "off"}`}>{r.active ? "active" : "off"}</span> },
        ]}
        fields={[
          { name: "name", label: "Name", required: true },
          { name: "details", label: "Account / handle / instructions", full: true },
          { name: "icon", label: "Icon key" },
          { name: "sort_order", label: "Sort order", type: "number" },
          { name: "active", label: "Active", type: "checkbox" },
        ]}
        defaults={{ active: true, sort_order: 0, icon: "card" }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "1.8rem 0 .8rem" }}>
        <h3 style={{ margin: 0 }}>💸 Cashouts</h3><ExportButton resource="cashouts" label="Export Cashouts" />
      </div>
      <Crud
        title="Cashouts" addLabel="Record Cashout" endpoint="/cashouts/"
        columns={[
          { key: "player", label: "Player", render: (r) => <b>{r.player}</b> },
          { key: "amount", label: "Amount", render: (r) => <span className="gold">${num(r.amount)}</span> },
          { key: "method", label: "Method" },
          { key: "status", label: "Status", render: (r) => <span className={`badge ${r.status === "paid" ? "ok" : r.status === "pending" ? "warn" : "off"}`}>{r.status}</span> },
          { key: "date", label: "Date" },
        ]}
        fields={[
          { name: "player", label: "Player", required: true },
          { name: "amount", label: "Amount", type: "number", required: true },
          { name: "method", label: "Method" },
          { name: "game", label: "Game" },
          { name: "status", label: "Status", type: "select", options: [{ value: "paid", label: "Paid" }, { value: "pending", label: "Pending" }, { value: "rejected", label: "Rejected" }] },
          { name: "date", label: "Date", type: "date", required: true },
          { name: "notes", label: "Notes", full: true },
        ]}
        defaults={{ date: new Date().toISOString().slice(0, 10) }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "1.8rem 0 .8rem" }}>
        <h3 style={{ margin: 0 }}>📅 Daily Profit</h3><ExportButton resource="profit" label="Export Profit" />
      </div>
      <Crud
        title="Profit Records" addLabel="Record Profit" endpoint="/profit/"
        columns={[
          { key: "date", label: "Date", render: (r) => <b>{r.date}</b> },
          { key: "amount", label: "Amount", render: (r) => <span className="gold">${num(r.amount)}</span> },
          { key: "notes", label: "Notes" },
        ]}
        fields={[
          { name: "date", label: "Date", type: "date", required: true },
          { name: "amount", label: "Amount", type: "number", required: true },
          { name: "notes", label: "Notes", full: true },
        ]}
        defaults={{ date: new Date().toISOString().slice(0, 10) }}
      />
    </div>
  );
}
