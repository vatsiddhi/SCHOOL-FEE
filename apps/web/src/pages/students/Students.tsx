import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { can, http, inr, type User } from "../../lib/api";
import { useList } from "../../lib/useList";

type Row = { id: string; admissionNo: string; name: string; className: string | null; section: string | null; rollNo: string | null; classOrder: number; guardian: string | null; guardianPhone: string | null; outstandingPaise: number; overduePaise: number; status: string };

export default function Students() {
  const { user } = useOutletContext<{ user: User }>();
  const units = useList<any>("/api/setup/units");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState(""); const [unitId, setUnitId] = useState(""); const [status, setStatus] = useState("active"); const [dues, setDues] = useState("");
  useEffect(() => {
    setRows(null);
    const t = setTimeout(() => http.get<Row[]>(`/api/students?status=${status}&unitId=${unitId}&q=${encodeURIComponent(q)}`).then(setRows), 250);
    return () => clearTimeout(t);
  }, [q, unitId, status]);
  const vis = useMemo(() => (rows || []).filter(r => !dues || (dues === "overdue" ? r.overduePaise > 0 : dues === "due" ? r.outstandingPaise > 0 : r.outstandingPaise === 0))
    .sort((a, b) => a.classOrder - b.classOrder || (a.section || "").localeCompare(b.section || "") || a.admissionNo.localeCompare(b.admissionNo)), [rows, dues]);
  const total = vis.reduce((t, r) => t + r.outstandingPaise, 0);

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Students</h1><p className="muted">{rows ? `${vis.length} students · ${inr(total)} outstanding` : "Loading…"}</p></div>
        {can(user, "students.write") && <div className="row-gap"><Link to="/students/import" className="secondary sm btnlink">Import from Excel/CSV</Link><Link to="/students/new" className="primary btn btnlink-primary">+ Add student</Link></div>}</div>
      <div className="toolbar">
        <input placeholder="Search name, admission no or mobile…" value={q} onChange={e => setQ(e.target.value)} />
        <select value={unitId} onChange={e => setUnitId(e.target.value)} style={{ maxWidth: 180 }}><option value="">All classes</option>{units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <select value={dues} onChange={e => setDues(e.target.value)} style={{ maxWidth: 170 }}><option value="">Any dues</option><option value="due">With dues</option><option value="overdue">Overdue</option><option value="clear">Fully paid</option></select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ maxWidth: 160 }}><option value="active">Active</option><option value="left">Left</option><option value="transferred">Transferred (TC)</option><option value="passed_out">Passed out</option></select>
      </div>
      <section className="panel">{!rows ? <p className="muted pad">Loading…</p> : vis.length === 0 ? <p className="muted pad">No students match.</p> : (
        <table><thead><tr><th>Adm. No</th><th>Student</th><th>Class</th><th>Parent</th><th className="num">Overdue</th><th className="num">Outstanding</th></tr></thead>
          <tbody>{vis.map(r => (
            <tr key={r.id} className="click"><td><Link to={`/students/${r.id}`}>{r.admissionNo}</Link></td><td><Link to={`/students/${r.id}`} className="plain-link"><b>{r.name}</b></Link></td>
              <td>{r.className ? `${r.className}${r.section ? "-" + r.section : ""}` : "—"}{r.rollNo && <span className="muted small"> · Roll {r.rollNo}</span>}</td>
              <td>{r.guardian || "—"}<div className="muted small">{r.guardianPhone}</div></td>
              <td className="num">{r.overduePaise > 0 ? <span className="pill bad">{inr(r.overduePaise)}</span> : <span className="muted">—</span>}</td>
              <td className="num"><span className={r.outstandingPaise > 0 ? "pill due" : "pill clear"}>{r.outstandingPaise > 0 ? inr(r.outstandingPaise) : "Paid"}</span></td></tr>
          ))}</tbody></table>)}
      </section>
    </div>
  );
}
