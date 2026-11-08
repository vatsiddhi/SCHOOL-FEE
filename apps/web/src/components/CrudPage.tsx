import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { http, isoDate, toPaise } from "../lib/api";

export type Field = {
  name: string; label: string;
  type?: "text" | "number" | "money" | "percent" | "date" | "select" | "checkbox" | "password" | "email";
  options?: { value: string; label: string }[] | (() => { value: string; label: string }[]);
  required?: boolean; placeholder?: string; help?: string; hideInEdit?: boolean; showIf?: (v: Record<string, any>) => boolean;
  span?: 1 | 2;
};
export type Column<T> = { label: string; render: (r: T) => ReactNode; num?: boolean };

type Props<T> = {
  title: string; subtitle?: string; endpoint: string; fields: Field[]; columns: Column<T>[];
  canWrite: boolean; defaults?: Record<string, any>; deleteLabel?: string; emptyText?: string;
  toForm?: (r: T) => Record<string, any>; extraActions?: (r: T, reload: () => void) => ReactNode; searchKeys?: (r: T) => string;
};

/** Convert UI form values to API payload (money -> paise, percent -> basis points, blank -> null) */
function toPayload(fields: Field[], v: Record<string, any>, editing: boolean) {
  const out: Record<string, any> = {};
  for (const f of fields) {
    if (editing && f.hideInEdit) continue;
    if (f.showIf && !f.showIf(v)) continue;
    const x = v[f.name];
    if (f.type === "checkbox") out[f.name] = !!x;
    else if (f.type === "money") out[f.name] = x === "" || x == null ? null : toPaise(x);
    else if (f.type === "percent") out[f.name] = x === "" || x == null ? null : Math.round(Number(x) * 100);
    else if (f.type === "number") out[f.name] = x === "" || x == null ? null : Number(x);
    else if (f.type === "password") { if (x) out[f.name] = x; }
    else out[f.name] = x === "" ? null : x;
  }
  return out;
}
export function fromRow(fields: Field[], r: any) {
  const v: Record<string, any> = {};
  for (const f of fields) {
    const x = r[f.name];
    if (f.type === "money") v[f.name] = x == null ? "" : x / 100;
    else if (f.type === "percent") v[f.name] = x == null ? "" : x / 100;
    else if (f.type === "date") v[f.name] = isoDate(x);
    else if (f.type === "password") v[f.name] = "";
    else v[f.name] = x ?? (f.type === "checkbox" ? false : "");
  }
  return v;
}

export default function CrudPage<T extends { id: string; isActive?: boolean }>(p: Props<T>) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(() => { http.get<T[]>(p.endpoint).then(setRows).catch(e => setError(e.message)); }, [p.endpoint]);
  useEffect(load, [load]);

  const blank = () => { const v = fromRow(p.fields, {}); return { ...v, ...(p.defaults || {}) }; };
  const openNew = () => { setEditing(null); setForm(blank()); setFormErr(""); };
  const openEdit = (r: T) => { setEditing(r); setForm(p.toForm ? p.toForm(r) : fromRow(p.fields, r)); setFormErr(""); };

  async function save(e: FormEvent) {
    e.preventDefault(); if (!form) return;
    setBusy(true); setFormErr("");
    try {
      const body = toPayload(p.fields, form, !!editing);
      if (editing) await http.put(`${p.endpoint}/${editing.id}`, body); else await http.post(p.endpoint, body);
      setForm(null); load();
    } catch (err) { setFormErr((err as Error).message); } finally { setBusy(false); }
  }
  async function remove(r: T) {
    if (!confirm(`${p.deleteLabel || "Remove"} this record?`)) return;
    try { await http.del(`${p.endpoint}/${r.id}`); load(); } catch (err) { alert((err as Error).message); }
  }

  const hasActive = rows?.some(r => "isActive" in r);
  const visible = useMemo(() => (rows || [])
    .filter(r => showInactive || r.isActive !== false)
    .filter(r => !q || (p.searchKeys ? p.searchKeys(r) : JSON.stringify(r)).toLowerCase().includes(q.toLowerCase())), [rows, q, showInactive, p]);

  return (
    <>
      <div className="page-head">
        <div><h1>{p.title}</h1>{p.subtitle && <p className="muted">{p.subtitle}</p>}</div>
        {p.canWrite && <button className="primary btn" onClick={openNew}>+ Add</button>}
      </div>
      <div className="toolbar">
        <input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
        {hasActive && <label className="check"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show inactive</label>}
      </div>
      <section className="panel">
        {error && <div className="alert">{error}</div>}
        {!rows && !error && <p className="muted pad">Loading…</p>}
        {rows && visible.length === 0 && <p className="muted pad">{p.emptyText || "Nothing here yet."}</p>}
        {rows && visible.length > 0 && (
          <table>
            <thead><tr>{p.columns.map(c => <th key={c.label} className={c.num ? "num" : ""}>{c.label}</th>)}{(p.canWrite || p.extraActions) && <th />}</tr></thead>
            <tbody>{visible.map(r => (
              <tr key={r.id} className={r.isActive === false ? "inactive" : ""}>
                {p.columns.map(c => <td key={c.label} className={c.num ? "num" : ""}>{c.render(r)}</td>)}
                {(p.canWrite || p.extraActions) && <td className="actions">
                  {p.extraActions?.(r, load)}
                  {p.canWrite && <button className="ghost" onClick={() => openEdit(r)}>Edit</button>}
                  {p.canWrite && r.isActive !== false && <button className="ghost danger" onClick={() => remove(r)}>{p.deleteLabel || "Remove"}</button>}
                  {p.canWrite && r.isActive === false && <button className="ghost" onClick={async () => { await http.put(`${p.endpoint}/${r.id}`, { isActive: true }); load(); }}>Restore</button>}
                </td>}
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      {form && (
        <div className="modal-bg" onMouseDown={() => !busy && setForm(null)}>
          <form className="modal" onSubmit={save} onMouseDown={e => e.stopPropagation()}>
            <h2>{editing ? "Edit" : "Add"} {p.title.replace(/s$/, "").toLowerCase()}</h2>
            {formErr && <div className="alert">{formErr}</div>}
            <div className="grid2">
              {p.fields.filter(f => !(editing && f.hideInEdit) && (!f.showIf || f.showIf(form))).map(f => (
                <FieldInput key={f.name} f={f} value={form[f.name]} onChange={v => setForm({ ...form, [f.name]: v })} editing={!!editing} />
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setForm(null)} disabled={busy}>Cancel</button>
              <button className="primary btn" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

export function FieldInput({ f, value, onChange, editing }: { f: Field; value: any; onChange: (v: any) => void; editing?: boolean }) {
  const opts = typeof f.options === "function" ? f.options() : f.options;
  if (f.type === "checkbox") return (
    <label className={"check field-check" + (f.span === 2 ? " span2" : "")}><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} /> {f.label}</label>
  );
  return (
    <label className={"field" + (f.span === 2 ? " span2" : "")}>
      <span>{f.label}{f.required && <em className="req">*</em>}</span>
      {f.type === "select" ? (
        <select value={value ?? ""} onChange={e => onChange(e.target.value)} required={f.required}>
          <option value="">{f.required ? "Select…" : "— None —"}</option>
          {opts?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <div className={f.type === "money" ? "affix" : f.type === "percent" ? "affix suffix" : ""}>
          {f.type === "money" && <i>₹</i>}
          <input
            type={f.type === "money" || f.type === "percent" || f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "password" ? "password" : f.type === "email" ? "email" : "text"}
            step={f.type === "money" ? "0.01" : f.type === "percent" ? "0.01" : undefined} min={f.type === "money" || f.type === "percent" ? 0 : undefined}
            value={value ?? ""} placeholder={f.type === "password" && editing ? "Leave blank to keep current" : f.placeholder}
            required={f.required && !(f.type === "password" && editing)} onChange={e => onChange(e.target.value)} />
          {f.type === "percent" && <i>%</i>}
        </div>
      )}
      {f.help && <small className="muted">{f.help}</small>}
    </label>
  );
}
