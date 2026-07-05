"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth";

/**
 * Generic admin CRUD manager.
 *  endpoint : DRF collection path, e.g. "/winners/"
 *  columns  : [{ key, label, render?(row) }]
 *  fields   : [{ name, label, type, options?, required?, help?, full? }]
 *             types: text|textarea|number|url|date|password|select|checkbox|file
 *  defaults : object of default form values for "Add"
 */
export default function Crud({ title, endpoint, columns, fields, defaults = {},
  addLabel = "Add", canAdd = true, canEdit = true, canDelete = true, lookupKey = "id",
  searchKeys = null }) {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaults);
  const [files, setFiles] = useState({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const hasFiles = fields.some((f) => f.type === "file");
  const visible = searchKeys && query.trim()
    ? rows.filter((r) => searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(query.toLowerCase())))
    : rows;

  const load = useCallback(() => {
    apiFetch(endpoint, { token }).then(setRows).catch(() => {});
  }, [endpoint, token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  function openAdd() {
    setEditing(null); setForm(defaults); setFiles({}); setErr(""); setOpen(true);
  }
  async function openEdit(row) {
    // Fetch the full detail record so sparse list rows don't blank fields on save.
    let full = row;
    try { full = await apiFetch(`${endpoint}${row[lookupKey]}/`, { token }); } catch {}
    const f = {};
    fields.forEach((fl) => {
      if (fl.type === "file") return;
      let v = full[fl.name];
      if (fl.name === "category" && v && typeof v === "object") v = v.id; // safety
      f[fl.name] = v ?? (fl.type === "checkbox" ? false : "");
    });
    setEditing(full); setForm(f); setFiles({}); setErr(""); setOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    const method = editing ? "PATCH" : "POST";
    const path = editing ? `${endpoint}${editing[lookupKey]}/` : endpoint;
    try {
      const anyFile = Object.values(files).some(Boolean);
      if (hasFiles && anyFile) {
        const fd = new FormData();
        fields.forEach((fl) => {
          if (fl.type === "file") { if (files[fl.name]) fd.append(fl.name, files[fl.name]); }
          else if (fl.type === "checkbox") fd.append(fl.name, form[fl.name] ? "true" : "false");
          else if (form[fl.name] !== "" && form[fl.name] != null) fd.append(fl.name, form[fl.name]);
        });
        await apiFetch(path, { method, token, body: fd, isForm: true });
      } else {
        const payload = {};
        fields.forEach((fl) => {
          if (fl.type === "file") return;
          payload[fl.name] = fl.type === "checkbox" ? !!form[fl.name] : form[fl.name];
        });
        await apiFetch(path, { method, token, body: payload });
      }
      setOpen(false); load();
    } catch (e2) {
      setErr(e2.data ? JSON.stringify(e2.data) : (e2.message || "Save failed"));
    } finally { setBusy(false); }
  }

  async function del(row) {
    if (!confirm(`Delete this ${title.toLowerCase()}?`)) return;
    try { await apiFetch(`${endpoint}${row[lookupKey]}/`, { method: "DELETE", token }); load(); }
    catch {}
  }

  return (
    <div>
      <div className="toolbar">
        <span className="muted small">{visible.length} {title.toLowerCase()}</span>
        <div style={{ display: "flex", gap: ".6em" }}>
          {searchKeys && <input placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ margin: 0, width: 200 }} />}
          {canAdd && <button className="btn btn-primary" onClick={openAdd}>＋ {addLabel}</button>}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="dtable">
          <thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}<th></th></tr></thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : String(row[c.key] ?? "—")}</td>)}
                <td><div className="row-btns">
                  {canEdit && <button className="ibtn" title="Edit" onClick={() => openEdit(row)}>✎</button>}
                  {canDelete && <button className="ibtn danger" title="Delete" onClick={() => del(row)}>🗑</button>}
                </div></td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={columns.length + 1} className="muted center" style={{ padding: "2rem" }}>Nothing yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="modal-bg" onMouseDown={(e) => e.target.classList.contains("modal-bg") && setOpen(false)}>
          <form className="modal" onSubmit={save}>
            <div className="modal-head"><h3>{editing ? "Edit" : addLabel}</h3><button type="button" className="ibtn" onClick={() => setOpen(false)}>✕</button></div>
            {err && <div className="alert err small">{err}</div>}
            <div className="form-grid">
              {fields.map((fl) => (
                <label key={fl.name} className={fl.full || ["textarea"].includes(fl.type) ? "full" : ""}>
                  {fl.label}{fl.help && <span className="muted small"> — {fl.help}</span>}
                  {fl.type === "textarea" ? (
                    <textarea rows={fl.rows || 3} value={form[fl.name] || ""} onChange={(e) => setForm({ ...form, [fl.name]: e.target.value })} />
                  ) : fl.type === "select" ? (
                    <select value={form[fl.name] ?? ""} onChange={(e) => setForm({ ...form, [fl.name]: e.target.value })}>
                      {(fl.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : fl.type === "checkbox" ? (
                    <div className="field-row"><input type="checkbox" checked={!!form[fl.name]} onChange={(e) => setForm({ ...form, [fl.name]: e.target.checked })} /> <span className="muted small">{fl.hint || "Enabled"}</span></div>
                  ) : fl.type === "file" ? (
                    <input type="file" accept="image/*" onChange={(e) => setFiles({ ...files, [fl.name]: e.target.files[0] })} />
                  ) : (
                    <input type={fl.type || "text"} value={form[fl.name] ?? ""} required={fl.required}
                      onChange={(e) => setForm({ ...form, [fl.name]: e.target.value })} />
                  )}
                </label>
              ))}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
