import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { can, fmtDate, http, inr2, type User } from "../../lib/api";
import { useList } from "../../lib/useList";

export default function StudentDetail() {
  const { id } = useParams(); const { user } = useOutletContext<{ user: User }>();
  const [s, setS] = useState<any>(null); const [err, setErr] = useState("");
  const load = useCallback(() => { http.get<any>(`/api/students/${id}`).then(setS).catch(e => setErr(e.message)); }, [id]);
  useEffect(load, [load]);
  if (!s) return <p className="muted">{err || "Loading…"}</p>;
  const en = s.enrollments[0];
  const live = s.feeDemands.filter((d: any) => d.status !== "cancelled");
  const tot = (k: string) => live.reduce((t: number, d: any) => t + d[k], 0);
  const now = Date.now();
  const overdue = live.filter((d: any) => d.balancePaise > 0 && new Date(d.dueDate).getTime() < now).reduce((t: number, d: any) => t + d.balancePaise, 0);

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>{s.name}</h1><p className="muted">Adm. {s.admissionNo}{en && ` · ${en.unit.name}${en.section ? "-" + en.section.name : ""} · ${en.academicYear.name}`} · <span className="cap">{s.status.replace("_", " ")}</span></p></div>
        {can(user, "students.write") && <Link to={`/students/${s.id}/edit`} className="secondary sm btnlink">Edit details</Link>}
      </div>
      <section className="stats four">
        <div className="stat"><small>Total fees</small><b>{inr2(tot("netPaise"))}</b></div>
        <div className="stat"><small>Paid</small><b>{inr2(tot("paidPaise"))}</b></div>
        <div className="stat"><small>Overdue</small><b className={overdue ? "bad-text" : ""}>{inr2(overdue)}</b></div>
        <div className="stat accent"><small>Balance</small><b>{inr2(tot("balancePaise"))}</b></div>
      </section>
      <div className="two-col">
        <section className="panel card-pad"><h3>Parents / guardians</h3>
          {s.guardians.map((g: any) => <div key={g.guardianId} className="kv"><span className="cap muted">{g.guardian.relation}{g.isPrimary ? " (primary)" : ""}</span><span><b>{g.guardian.name}</b> · {g.guardian.phone}{g.guardian.email ? ` · ${g.guardian.email}` : ""}</span></div>)}
          {s.siblings.length > 0 && <div className="kv"><span className="muted">Siblings</span><span>{s.siblings.map((x: any) => <Link key={x.id} to={`/students/${x.id}`} style={{ marginRight: 10 }}>{x.name} ({x.admissionNo})</Link>)}</span></div>}
          <div className="kv"><span className="muted">Date of birth</span><span>{fmtDate(s.dob)}</span></div>
          <div className="kv"><span className="muted">Category</span><span>{s.category?.toUpperCase() || "—"}{s.isRte ? " · RTE" : ""}</span></div>
        </section>
        {en && <Mapping s={s} en={en} user={user} onChange={load} />}
      </div>
      <Concessions s={s} user={user} onChange={load} />
      <section className="panel">
        <div className="row-between pad"><h3>Fee ledger</h3><span className="muted small">Late fines are worked out as of today</span></div>
        {live.length === 0 ? <p className="muted pad">No dues yet. Map a fee structure and generate dues.</p> : (
          <table><thead><tr><th>Period</th><th>Fee head</th><th>Due date</th><th className="num">Amount</th><th className="num">Concession</th><th className="num">Net</th><th className="num">Paid</th><th className="num">Fine</th><th className="num">Balance</th></tr></thead>
            <tbody>{live.map((d: any) => (
              <tr key={d.id}><td>{d.periodLabel}</td><td>{d.feeHead.name}</td><td>{fmtDate(d.dueDate)}</td><td className="num">{inr2(d.grossPaise)}</td>
                <td className="num">{d.concessionPaise ? `−${inr2(d.concessionPaise)}` : "—"}</td><td className="num">{inr2(d.netPaise)}</td><td className="num">{d.paidPaise ? inr2(d.paidPaise) : "—"}</td>
                <td className="num">{d.finePaise ? <span className="bad-text">{inr2(d.finePaise)}</span> : "—"}</td>
                <td className="num">{d.balancePaise > 0 ? <span className={new Date(d.dueDate).getTime() < now ? "pill bad" : "pill due"}>{inr2(d.balancePaise)}</span> : <span className="pill clear">Paid</span>}</td></tr>))}
            </tbody>
            <tfoot><tr><td colSpan={3}><b>Total</b></td><td className="num">{inr2(tot("grossPaise"))}</td><td className="num">−{inr2(tot("concessionPaise"))}</td><td className="num"><b>{inr2(tot("netPaise"))}</b></td><td className="num">{inr2(tot("paidPaise"))}</td><td className="num">{inr2(tot("finePaise"))}</td><td className="num"><b>{inr2(tot("balancePaise"))}</b></td></tr></tfoot>
          </table>)}
      </section>
    </div>
  );
}

function Mapping({ s, en, user, onChange }: any) {
  const structures = useList<any>(`/api/setup/fee-structures?academicYearId=${en.academicYearId}`);
  const [edit, setEdit] = useState(false); const [v, setV] = useState<any>(null); const [msg, setMsg] = useState("");
  const write = can(user, "students.write");
  const opted = new Set(en.optionalHeads.map((o: any) => o.feeHeadId));
  const start = () => { setV({ feeStructureId: en.feeStructureId || "", optionalHeadIds: [...opted] }); setEdit(true); setMsg(""); };
  const chosen = v?.feeStructureId ? structures.find(x => x.id === v.feeStructureId) : null;
  const optionalHeads = chosen ? chosen.items.filter((i: any) => i.feeHead.isOptional).map((i: any) => ({ id: i.feeHeadId, name: i.feeHead.name })) : s.resolvedStructure?.optionalHeads || [];
  async function save() {
    await http.put(`/api/students/${s.id}/mapping`, { academicYearId: en.academicYearId, feeStructureId: v.feeStructureId || null, feeCategory: en.feeCategory, optionalHeadIds: v.optionalHeadIds });
    setEdit(false); onChange();
  }
  async function generate() {
    const r: any = await http.post("/api/dues/generate", { academicYearId: en.academicYearId, studentIds: [s.id], dryRun: false });
    setMsg(r.created ? `${r.created} dues created` : r.noStructure.length ? "No fee structure found for this student" : "Dues are already up to date"); onChange();
  }
  return (
    <section className="panel card-pad"><div className="row-between"><h3>Fee mapping · {en.academicYear.name}</h3>{write && !edit && <button className="ghost" onClick={start}>Change</button>}</div>
      {!edit ? <>
        <div className="kv"><span className="muted">Fee structure</span><span><b>{s.resolvedStructure?.name || "None found"}</b>{!en.feeStructureId && s.resolvedStructure && <span className="muted small"> (automatic by class)</span>}</span></div>
        <div className="kv"><span className="muted">Optional heads</span><span>{en.optionalHeads.length ? en.optionalHeads.map((o: any) => o.feeHead.name).join(", ") : "None"}</span></div>
        {write && <div className="row-gap"><button className="secondary sm" onClick={generate}>Generate missing dues</button>{msg && <span className="muted small">{msg}</span>}</div>}
      </> : <>
        <label className="field"><span>Fee structure</span><select value={v.feeStructureId} onChange={e => setV({ ...v, feeStructureId: e.target.value })}><option value="">Automatic (by class and category)</option>{structures.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <div className="field"><span>Optional fee heads</span>{optionalHeads.length === 0 ? <span className="muted small">This structure has no optional heads.</span> :
          optionalHeads.map((h: any) => <label key={h.id} className="check"><input type="checkbox" checked={v.optionalHeadIds.includes(h.id)} onChange={e => setV({ ...v, optionalHeadIds: e.target.checked ? [...v.optionalHeadIds, h.id] : v.optionalHeadIds.filter((x: string) => x !== h.id) })} /> {h.name}</label>)}</div>
        <div className="row-gap"><button className="secondary sm" onClick={() => setEdit(false)}>Cancel</button><button className="primary btn" onClick={save}>Save mapping</button></div>
        <p className="muted small" style={{ margin: 0 }}>Removing an optional head cancels its unpaid future dues.</p>
      </>}
    </section>
  );
}

function Concessions({ s, user, onChange }: any) {
  const all = useList<any>("/api/setup/concessions");
  const [v, setV] = useState({ concessionId: "", remarks: "" }); const [err, setErr] = useState(""); const [open, setOpen] = useState(false);
  const approve = can(user, "approve");
  async function add() { setErr(""); try { await http.post(`/api/students/${s.id}/concessions`, v); setOpen(false); setV({ concessionId: "", remarks: "" }); onChange(); } catch (x) { setErr((x as Error).message); } }
  async function remove(sc: any) { if (confirm(`Remove ${sc.concession.name}? Unpaid dues will be recalculated.`)) { await http.del(`/api/students/${s.id}/concessions/${sc.id}`); onChange(); } }
  return (
    <section className="panel card-pad"><div className="row-between"><h3>Concessions</h3>{approve && !open && <button className="ghost" onClick={() => setOpen(true)}>+ Give concession</button>}</div>
      {s.concessions.length === 0 && !open && <span className="muted small">No concessions.</span>}
      {s.concessions.map((c: any) => <div key={c.id} className="kv"><span><b>{c.concession.name}</b> · {c.concession.type === "percent" ? `${c.concession.valueBps / 100}%` : inr2(c.concession.valuePaise)} on {c.concession.feeHead?.name || "all eligible heads"}</span>
        <span className="muted small">{c.remarks}{approve && <button className="ghost danger" onClick={() => remove(c)}>Remove</button>}</span></div>)}
      {open && <div className="grid2">{err && <div className="alert span2">{err}</div>}
        <label className="field"><span>Concession</span><select value={v.concessionId} onChange={e => setV({ ...v, concessionId: e.target.value })}><option value="">Select…</option>{all.filter(c => c.isActive).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field"><span>Reason / approval note</span><input value={v.remarks} onChange={e => setV({ ...v, remarks: e.target.value })} placeholder="Elder sibling in Class 8" /></label>
        <div className="row-gap span2"><button className="secondary sm" onClick={() => setOpen(false)}>Cancel</button><button className="primary btn" onClick={add} disabled={!v.concessionId}>Approve concession</button></div>
        <p className="muted small span2" style={{ margin: 0 }}>Applied to dues that have no payment yet. Recorded in the audit log.</p></div>}
    </section>
  );
}
