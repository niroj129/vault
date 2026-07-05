"use client";

import Crud from "../../../components/admin/Crud";
import ExportButton from "../../../components/admin/ExportButton";
import { mediaUrl } from "../../../lib/api";

export default function AdminWinners() {
  return (
    <div>
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: ".6rem" }}><ExportButton resource="winners" label="Export Winners" /></div>
    <Crud
      title="Winners" addLabel="Add Winner" endpoint="/winners/"
      columns={[
        { key: "photo", label: "", render: (r) => r.photo ? <img className="thumb-sm" style={{ borderRadius: "50%" }} src={mediaUrl(r.photo)} alt="" /> : "🏆" },
        { key: "name", label: "Winner", render: (r) => <b>{r.name}</b> },
        { key: "amount", label: "Amount", render: (r) => <span className="gold">${Number(r.amount).toLocaleString()}</span> },
        { key: "game", label: "Game" },
        { key: "win_date", label: "Date" },
      ]}
      fields={[
        { name: "name", label: "Winner Name", required: true },
        { name: "amount", label: "Winning Amount", type: "number", required: true },
        { name: "game", label: "Winning Game" },
        { name: "win_date", label: "Date", type: "date", required: true },
        { name: "photo", label: "Winner Photo (optional)", type: "file", full: true },
      ]}
      defaults={{ win_date: new Date().toISOString().slice(0, 10) }}
    />
    </div>
  );
}
