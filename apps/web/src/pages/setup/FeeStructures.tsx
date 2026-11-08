import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import { can, fmtDate, http, inr, inr2, isoDate, toPaise, type User } from "../../lib/api";
import { useList, clearLists } from "../../lib/useList";

const FREQ: [string, string][] = [["one_time", "One-time"], ["monthly", "Monthly"], ["bi_monthly", "Bi-monthly"], ["quarterly", "Quarterly"], ["half_yearly", "Half-yearly"], ["term", "Term-wise"], ["semester", "Semester-wise"], ["yearly", "Yearly"], ["per_installment", "Every instalment"]];
const freqLabel = (f: string) => FREQ.find(x => x[0] === f)?.[1] || f;
const CATS = [["", "All students"], ["new", "New admissions"], ["old", "Existing students"], ["management", "Management quota"], ["hosteller", "Hostellers"], ["day_scholar", "Day scholars"], ["nri", "NRI"]];

type Item = { feeHeadId: string; amount: string; frequency: string };
type Inst = { label: string; dueDate: string };
type Form = { id?: string; name: string; academicYearId: string; unitId: string; category: string; lateFineRuleId: string; items: Item[]; installments: Inst[] };

/** Instalment templates matching the Indian academic year (April start) */
function template(kind: string, startYear: number): Inst[] {
  const d = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}-10`;
  const mon = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
  if (kind === "monthly") return mon.map((m, i) => ({ label: `${m} ${i < 9 ? startYear : startYear + 1}`, dueDate: d(i < 9 ? startYear : startYear + 1, ((i + 3) % 12) + 1) }));
  if (kind === "quarterly") return [["Q1 (Apr-Jun)", d(startYear, 4)], ["Q2 (Jul-Sep)", d(startYear, 7)], ["Q3 (Oct-Dec)", d(startYear, 10)], ["Q4 (Jan-Mar)", d(startYear + 1, 1)]].map(([label, dueDate]) => ({ label, dueDate }));
  if (kind === "half") return [["Term 1 (Apr-Sep)", d(startYear, 4)], ["Term 2 (Oct-Mar)", d(startYear, 10)]].map(([label, dueDate]) => ({ label, dueDate }));
  if (kind === "terms3") return [["Term 1", d(startYear, 4)], ["Term 2", d(startYear, 8)], ["Term 3", d(startYear, 12)]].map(([label, dueDate]) => ({ label, dueDate }));
  return [{ label: "Annual", dueDate: d(startYear, 4) }];
}

const timesPerYear = (f: string, n: number) => (f === "one_time" || f === "yearly" ? 1 : Math.max(n, 1));

export default function FeeStructures() {
  const { user } = useOutletContext<{ user: User }>();
  const write = can(user, "setup.write");
  const [rows, setRows] = useState<any[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [yearFilter, setYearFilter] = useState("");
  const [copyOf, setCopyOf] = useState<any | null>(null);
  useEffect(() => clearLists(), []);
  const years = useList<any>("/api/setup/academic-years");
  const units = useList<any>("/api/setup/units");
  const heads = useList<any>("/api/setup/fee-heads");
  const fines = useList<any>("/api/setup/late-fine-rules");

  const load = useCallback(() => { http.get<any[]>("/api/setup/fee-structures" + (yearFilter ? `?academicYearId=${yearFilter}` : "")).then(setRows); }, [yearFilter]);
  useEffect(load, [load]);
  useEffect(() => { if (!yearFilter && years.length) setYearFilter(years.find(y => y.isCurrent)?.id || years[0].id); }, [years, yearFilter]);

  const newForm = (): Form => ({ name: "", academicYearId: yearFilter, unitId: "", category: "", lateFineRuleId: "", items: [{ feeHeadId: "", amount: "", frequency: "quarterly" }], installments: template("quarterly", Number((years.find(y => y.id === yearFilter)?.name || "2026").slice(0, 4))) });
  const edit = (r: any): Form => ({ id: r.id, name: r.name, academicYearId: r.academicYearId, unitId: r.unitId, category: r.category || "", lateFineRuleId: r.lateFineRuleId || "",
    items: r.items.map((i: any) => ({ feeHeadId: i.feeHeadId, amount: String(i.amountPaise / 100), frequency: i.frequency })), installments: r.installments.map((i: any) => ({ label: i.label, dueDate: isoDate(i.dueDate) })) });

  async function save(e: FormEvent) {
    e.preventDefault(); if (!form) return; setBusy(true); setErr("");
    const body = { ...form, items: form.items.filter(i => i.feeHeadId).map(i => ({ feeHeadId: i.feeHeadId, amountPaise: toPaise(i.amount), frequency: i.frequency })) };
    try { if (form.id) await http.put(`/api/setup/fee-structures/${form.id}`, body); else await http.post("/api/setup/fee-structures", body); setForm(null); load(); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }
  async function remove(r: any) { if (!confirm(`Delete "${r.name}"?`)) return; try { await http.del(`/api/setup/fee-structures/${r.id}`); load(); } catch (x) { alert((x as Error).message); } }

  const setItem = (i: number, k: keyof Item, v: string) => setForm(f => f && { ...f, items: f.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) });
  const setInst = (i: number, k: keyof Inst, v: string) => setForm(f => f && { ...f, installments: f.installments.map((it, j) => (j === i ? { ...it, [k]: v } : it)) });
  const yearStart = form ? Number((years.find(y => y.id === form.academicYearId)?.name || "2026").slice(0, 4)) : 2026;
  const n = form?.installments.length || 0;
  const total = form ? form.items.reduce((t, i) => t + toPaise(i.amount) * timesPerYear(i.frequency, n), 0) : 0;

  if (form) return (
    <form className="stack" onSubmit={save}>
      <div className="page-head"><div><h1>{form.id ? "Edit" : "New"} fee structure</h1><p className="muted">Fee heads, amounts and the instalment due dates.</p></div>
        <div className="row-gap"><button type="button" className="secondary" onClick={() => setForm(null)}>Cancel</button><button className="primary btn" disabled={busy}>{busy ? "Saving…" : "Save structure"}</button></div></div>
      {err && <div className="alert">{err}</div>}
      <section className="panel form-panel"><div className="grid2">
        <label className="field span2"><span>Structure name<em className="req">*</em></span><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Class 7 Fees 2026-27" /></label>
        <label className="field"><span>Academic year<em className="req">*</em></span><select required value={form.academicYearId} onChange={e => setForm({ ...form, academicYearId: e.target.value })}><option value="">Select…</option>{years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
        <label className="field"><span>Class / course<em className="req">*</em></span><select required value={form.unitId} onChange={e => { const u = units.find(x => x.id === e.target.value); setForm({ ...form, unitId: e.target.value, name: form.name || (u ? `${u.name} Fees ${years.find(y => y.id === form.academicYearId)?.name || ""}`.trim() : "") }); }}><option value="">Select…</option>{units.filter(u => u.isActive).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label className="field"><span>Applies to</span><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="field"><span>Late fine rule</span><select value={form.lateFineRuleId} onChange={e => setForm({ ...form, lateFineRuleId: e.target.value })}><option value="">No late fine</option>{fines.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      </div></section>

      <section className="panel form-panel">
        <div className="row-between"><h3>Fee heads</h3><button type="button" className="secondary sm" onClick={() => setForm({ ...form, items: [...form.items, { feeHeadId: "", amount: "", frequency: "one_time" }] })}>+ Add head</button></div>
        <table className="edit-table"><thead><tr><th>Fee head</th><th>Amount (₹)</th><th>Charged</th><th className="num">Per year</th><th /></tr></thead>
          <tbody>{form.items.map((it, i) => (
            <tr key={i}>
              <td><select required value={it.feeHeadId} onChange={e => setItem(i, "feeHeadId", e.target.value)}><option value="">Select…</option>{heads.filter(h => h.isActive).map(h => <option key={h.id} value={h.id} disabled={form.items.some((x, j) => j !== i && x.feeHeadId === h.id)}>{h.name}</option>)}</select></td>
              <td><input type="number" min="0" step="0.01" required value={it.amount} onChange={e => setItem(i, "amount", e.target.value)} /></td>
              <td><select value={it.frequency} onChange={e => setItem(i, "frequency", e.target.value)}>{FREQ.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
              <td className="num">{inr2(toPaise(it.amount) * timesPerYear(it.frequency, n))}</td>
              <td><button type="button" className="ghost danger" onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== i) })}>✕</button></td>
            </tr>))}</tbody>
          <tfoot><tr><td colSpan={3}><b>Total per student per year</b></td><td className="num"><b>{inr2(total)}</b></td><td /></tr></tfoot>
        </table>
        <p className="muted small">"One-time" and "Yearly" heads are charged in the first instalment. Other heads are charged in every instalment.</p>
      </section>

      <section className="panel form-panel">
        <div className="row-between"><h3>Instalments and due dates</h3>
          <div className="row-gap"><span className="muted small">Template:</span>
            {[["monthly", "Monthly"], ["quarterly", "Quarterly"], ["terms3", "3 terms"], ["half", "Half-yearly"], ["annual", "Annual"]].map(([k, l]) => <button type="button" key={k} className="secondary sm" onClick={() => setForm({ ...form, installments: template(k, yearStart) })}>{l}</button>)}
            <button type="button" className="secondary sm" onClick={() => setForm({ ...form, installments: [...form.installments, { label: `Instalment ${n + 1}`, dueDate: "" }] })}>+ Add</button></div></div>
        <table className="edit-table"><thead><tr><th>#</th><th>Label</th><th>Due date</th><th className="num">Amount due</th><th /></tr></thead>
          <tbody>{form.installments.map((x, i) => {
            const amt = form.items.reduce((t, it) => t + (["one_time", "yearly"].includes(it.frequency) ? (i === 0 ? toPaise(it.amount) : 0) : toPaise(it.amount)), 0);
            return <tr key={i}><td>{i + 1}</td><td><input required value={x.label} onChange={e => setInst(i, "label", e.target.value)} /></td><td><input type="date" required value={x.dueDate} onChange={e => setInst(i, "dueDate", e.target.value)} /></td>
              <td className="num">{inr2(amt)}</td><td><button type="button" className="ghost danger" onClick={() => setForm({ ...form, installments: form.installments.filter((_, j) => j !== i) })}>✕</button></td></tr>;
          })}</tbody></table>
      </section>
    </form>
  );

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Fee structures</h1><p className="muted">What each class pays, and when.</p></div>
        {write && <button className="primary btn" onClick={() => { setErr(""); setForm(newForm()); }}>+ New structure</button>}</div>
      <div className="toolbar"><select value={yearFilter} onChange={e => setYearFilter(e.target.value)}>{years.map(y => <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? " (current)" : ""}</option>)}</select></div>
      {!rows ? <p className="muted">Loading…</p> : rows.length === 0 ? <section className="panel"><p className="muted pad">No fee structures for this year yet.</p></section> : (
        <div className="cards">{rows.map(r => (
          <section key={r.id} className="panel card-pad">
            <div className="row-between"><div><h3>{r.name}</h3><div className="muted small">{r.unit.name} · {r.academicYear.name}{r.category ? ` · ${CATS.find(c => c[0] === r.category)?.[1]}` : ""}</div></div>
              <div className="big">{inr(r.yearlyTotalPaise)}<small className="muted"> / year</small></div></div>
            <table className="mini"><tbody>{r.items.map((i: any) => <tr key={i.id}><td>{i.feeHead.name}</td><td className="muted">{freqLabel(i.frequency)}</td><td className="num">{inr2(i.amountPaise)}</td></tr>)}</tbody></table>
            <div className="muted small">{r.installments.length} instalment(s){r.installments[0] ? `, first due ${fmtDate(r.installments[0].dueDate)}` : ""} · {r.lateFineRule ? `Late fine: ${r.lateFineRule.name}` : "No late fine"}</div>
            {write && <div className="row-gap"><button className="ghost" onClick={() => { setErr(""); setForm(edit(r)); }}>Edit</button><button className="ghost" onClick={() => setCopyOf(r)}>Copy</button><button className="ghost danger" onClick={() => remove(r)}>Delete</button></div>}
          </section>))}</div>
      )}
      {copyOf && <CopyDialog src={copyOf} years={years} units={units} onClose={(ok: boolean) => { setCopyOf(null); if (ok) load(); }} />}
    </div>
  );
}

function CopyDialog({ src, years, units, onClose }: any) {
  const [v, setV] = useState({ academicYearId: src.academicYearId, unitId: "", name: "" });
  const [err, setErr] = useState("");
  async function go(e: FormEvent) { e.preventDefault(); try { await http.post(`/api/setup/fee-structures/${src.id}/copy`, v); onClose(true); } catch (x) { setErr((x as Error).message); } }
  return (
    <div className="modal-bg" onMouseDown={() => onClose(false)}>
      <form className="modal" onSubmit={go} onMouseDown={e => e.stopPropagation()}>
        <h2>Copy "{src.name}"</h2>{err && <div className="alert">{err}</div>}
        <div className="grid2">
          <label className="field"><span>To year</span><select value={v.academicYearId} onChange={e => setV({ ...v, academicYearId: e.target.value })}>{years.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
          <label className="field"><span>To class</span><select required value={v.unitId} onChange={e => { const u = units.find((x: any) => x.id === e.target.value); setV({ ...v, unitId: e.target.value, name: `${u?.name || ""} Fees ${years.find((y: any) => y.id === v.academicYearId)?.name || ""}` }); }}><option value="">Select…</option>{units.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
          <label className="field span2"><span>New name</span><input required value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></label>
        </div>
        <p className="muted small">Instalment dates are copied as they are. Edit them after copying to a new year.</p>
        <div className="modal-actions"><button type="button" className="secondary" onClick={() => onClose(false)}>Cancel</button><button className="primary btn">Copy</button></div>
      </form>
    </div>
  );
}
