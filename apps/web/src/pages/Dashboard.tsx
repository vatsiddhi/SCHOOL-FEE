import { useEffect, useState } from "react";
import { api, inr, type User } from "../lib/api";

type Row = { id: string; admissionNo: string; name: string; outstandingPaise: number };

export default function Dashboard({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Row[]>("/api/students").then(setRows).catch(e => {
      if (e.status === 401) onSignOut(); else setError(e.message);
    });
  }, [onSignOut]);

  const total = rows?.reduce((t, r) => t + r.outstandingPaise, 0) ?? 0;
  const withDues = rows?.filter(r => r.outstandingPaise > 0).length ?? 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo dark"><span className="logo-mark">₹</span> FeeDesk</div>
        <div className="inst">{user.institution.name}</div>
        <div className="me">
          <div className="avatar">{user.name.split(" ").map(w => w[0]).slice(0, 2).join("")}</div>
          <div className="me-text"><div>{user.name}</div><small className="role">{user.role}</small></div>
          <button className="secondary sm" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <main className="content">
        <h1>Dues overview</h1>
        <section className="stats">
          <div className="stat"><small>Active students</small><b>{rows?.length ?? "–"}</b></div>
          <div className="stat"><small>Students with dues</small><b>{rows ? withDues : "–"}</b></div>
          <div className="stat accent"><small>Total outstanding</small><b>{rows ? inr(total) : "–"}</b></div>
        </section>

        <section className="panel">
          {error && <div className="alert">{error}</div>}
          {!rows && !error && <p className="muted">Loading…</p>}
          {rows && (
            <table>
              <thead><tr><th>Adm. No</th><th>Student</th><th className="num">Outstanding</th></tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.id}><td>{r.admissionNo}</td><td>{r.name}</td>
                  <td className="num"><span className={r.outstandingPaise > 0 ? "pill due" : "pill clear"}>{r.outstandingPaise > 0 ? inr(r.outstandingPaise) : "Paid"}</span></td></tr>
              ))}</tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}
