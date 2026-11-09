import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { can, http, inr2, type User } from "../../lib/api";

const MODE: Record<string, string> = { cash: "Cash", upi: "UPI", cheque: "Cheque", dd: "DD", card: "Card", neft: "Bank transfer" };
const today = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

export default function Collections() {
  const { user } = useOutletContext<{ user: User }>();
  const [date, setDate] = useState(today()); const [mine, setMine] = useState(!can(user, "reports")); const [d, setD] = useState<any>(null);
  useEffect(() => { setD(null); http.get<any>(`/api/receipts?date=${date}${mine ? "&mine=1" : ""}`).then(setD); }, [date, mine]);
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Day's collection</h1><p className="muted">{d ? `${d.count} receipts${d.cancelled ? `, ${d.cancelled} cancelled` : ""}${d.mine ? " · collected by you" : " · all counters"}` : "Loading…"}</p></div>
        <div className="row-gap no-print"><button className="secondary" onClick={() => window.print()}>Print</button><Link to="/collect" className="primary btn btnlink-primary">+ Collect fees</Link></div></div>
      <div className="toolbar no-print"><input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} style={{ maxWidth: 180 }} />
        {can(user, "reports") && <label className="check"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} /> Only my collection</label>}</div>
      {d && <section className="stats four">
        <div className="stat accent"><small>Total collected</small><b>{inr2(d.totalPaise)}</b></div>
        {["cash", "upi", "cheque"].map(m => <div key={m} className="stat"><small>{MODE[m]}</small><b>{inr2(d.byMode[m] || 0)}</b></div>)}
      </section>}
      {d && Object.keys(d.byMode).some(m => !["cash", "upi", "cheque"].includes(m)) && <p className="muted small">Also: {Object.entries(d.byMode).filter(([m]) => !["cash", "upi", "cheque"].includes(m)).map(([m, v]) => `${MODE[m]} ${inr2(v as number)}`).join(" · ")}</p>}
      <section className="panel">{!d ? <p className="pad muted">Loading…</p> : d.rows.length === 0 ? <p className="pad muted">No receipts on this day.</p> : (
        <table><thead><tr><th>Receipt</th><th>Time</th><th>Student</th><th>Mode</th><th>Collected by</th><th className="num">Fine</th><th className="num">Amount</th></tr></thead>
          <tbody>{d.rows.map((r: any) => (
            <tr key={r.id} className={r.status === "cancelled" ? "inactive" : ""}><td><Link to={`/receipts/${r.id}`}>{r.receiptNo}</Link>{r.status === "cancelled" && <span className="pill off" style={{ marginLeft: 6 }}>Cancelled</span>}</td>
              <td>{new Date(r.issuedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</td>
              <td><Link to={`/students/${r.studentId}`} className="plain-link">{r.student}</Link> <span className="muted small">{r.admissionNo}</span></td>
              <td>{MODE[r.mode]}{r.referenceNo && <div className="muted small">{r.referenceNo}</div>}</td><td>{r.collectedBy}</td>
              <td className="num">{r.finePaise ? inr2(r.finePaise) : "—"}</td><td className="num"><b>{inr2(r.totalPaise)}</b></td></tr>))}</tbody></table>)}
      </section>
    </div>
  );
}
