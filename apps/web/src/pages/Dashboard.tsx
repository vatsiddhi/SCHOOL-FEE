import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { can, http, inr, type User } from "../lib/api";

type Row = { id: string; admissionNo: string; name: string; outstandingPaise: number };
export default function Dashboard() {
  const { user } = useOutletContext<{ user: User }>();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [prog, setProg] = useState<any>(null);
  useEffect(() => {
    if (can(user, "students.read")) http.get<Row[]>("/api/students").then(setRows);
    if (can(user, "setup.read")) http.get("/api/setup/progress").then(setProg);
  }, [user]);
  const total = rows?.reduce((t, r) => t + r.outstandingPaise, 0) ?? 0;
  const withDues = rows?.filter(r => r.outstandingPaise > 0).length ?? 0;
  const top = [...(rows || [])].sort((a, b) => b.outstandingPaise - a.outstandingPaise).slice(0, 5);
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {user.name.split(" ")[0]}</h1><p className="muted">{user.institution.name}</p></div></div>
      <section className="stats">
        <div className="stat"><small>Active students</small><b>{rows?.length ?? "–"}</b></div>
        <div className="stat"><small>Students with dues</small><b>{rows ? withDues : "–"}</b></div>
        <div className="stat accent"><small>Total outstanding</small><b>{rows ? inr(total) : "–"}</b></div>
      </section>
      {prog && <section className="panel card-pad"><div className="row-between"><div><h3>Setup</h3><p className="muted small">{prog.units} classes · {prog.heads} fee heads · {prog.structures} fee structures · {prog.staff} staff</p></div><Link to="/setup" className="secondary sm btnlink">Open checklist</Link></div></section>}
      {rows && <section className="panel"><h3 className="pad">Highest dues</h3>
        <table><thead><tr><th>Adm. No</th><th>Student</th><th className="num">Outstanding</th></tr></thead>
          <tbody>{top.map(r => <tr key={r.id}><td>{r.admissionNo}</td><td>{r.name}</td><td className="num"><span className={r.outstandingPaise > 0 ? "pill due" : "pill clear"}>{r.outstandingPaise > 0 ? inr(r.outstandingPaise) : "Paid"}</span></td></tr>)}</tbody></table></section>}
    </div>
  );
}
