import { useEffect, useState } from "react";
import { http, inr } from "../lib/api";

type Row = { id: string; admissionNo: string; name: string; outstandingPaise: number };
export default function Students() {
  const [rows, setRows] = useState<Row[] | null>(null); const [q, setQ] = useState("");
  useEffect(() => { http.get<Row[]>("/api/students").then(setRows); }, []);
  const vis = (rows || []).filter(r => !q || (r.name + r.admissionNo).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Students</h1><p className="muted">Admission, guardian details and fee mapping arrive in the next milestone.</p></div></div>
      <div className="toolbar"><input placeholder="Search name or admission no…" value={q} onChange={e => setQ(e.target.value)} /></div>
      <section className="panel">{!rows ? <p className="muted pad">Loading…</p> : (
        <table><thead><tr><th>Adm. No</th><th>Student</th><th className="num">Outstanding</th></tr></thead>
          <tbody>{vis.map(r => <tr key={r.id}><td>{r.admissionNo}</td><td>{r.name}</td><td className="num"><span className={r.outstandingPaise > 0 ? "pill due" : "pill clear"}>{r.outstandingPaise > 0 ? inr(r.outstandingPaise) : "Paid"}</span></td></tr>)}</tbody></table>)}
      </section>
    </div>
  );
}
