import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { can, fmtDate, http, inr2, type User } from "../../lib/api";

const MODE: Record<string, string> = { cash: "Cash", upi: "UPI", cheque: "Cheque", dd: "Demand draft", card: "Card", neft: "Bank transfer" };

export default function Receipt() {
  const { id } = useParams(); const [params] = useSearchParams(); const { user } = useOutletContext<{ user: User }>();
  const [r, setR] = useState<any>(null); const [err, setErr] = useState("");
  const [cancel, setCancel] = useState(false); const [reason, setReason] = useState("");
  const load = () => http.get<any>(`/api/receipts/${id}`).then(setR).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [id]);
  if (!r) return <p className="muted">{err || "Loading…"}</p>;
  const time = new Date(r.issuedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
  async function doCancel() { try { await http.post(`/api/receipts/${id}/cancel`, { reason }); setCancel(false); load(); } catch (x) { alert((x as Error).message); } }

  return (
    <div className="stack">
      <div className="page-head no-print">
        <div><h1>Receipt {r.receiptNo}</h1>{params.get("new") && r.status === "valid" && <p className="ok-text">Payment saved. Print the receipt for the parent.</p>}</div>
        <div className="row-gap">
          <Link to="/collect" className="secondary sm btnlink">Next student</Link>
          {r.status === "valid" && can(user, "approve") && <button className="secondary danger-outline" onClick={() => setCancel(true)}>Cancel receipt</button>}
          <button className="primary btn" onClick={() => window.print()}>Print</button>
        </div>
      </div>
      {cancel && <section className="panel card-pad no-print"><h3>Cancel this receipt?</h3><p className="muted small" style={{ margin: 0 }}>The receipt is kept and marked cancelled. Its dues become payable again. This is recorded in the audit log.</p>
        <label className="field"><span>Reason</span><input value={reason} onChange={e => setReason(e.target.value)} placeholder="Cheque bounced / wrong student selected" /></label>
        <div className="row-gap"><button className="secondary" onClick={() => setCancel(false)}>Keep receipt</button><button className="primary btn danger-btn" onClick={doCancel} disabled={reason.trim().length < 5}>Cancel receipt</button></div></section>}

      <div className="receipt-paper">
        {r.status === "cancelled" && <div className="stamp">CANCELLED</div>}
        <header className="rc-head">
          {r.institution.logoUrl ? <img src={r.institution.logoUrl} alt="" /> : <div className="rc-logo">{r.institution.name.split(" ").map((w: string) => w[0]).slice(0, 3).join("")}</div>}
          <div><div className="rc-name">{r.institution.name}</div>
            {r.institution.trustName && <div className="small">Managed by {r.institution.trustName}</div>}
            <div className="small">{r.institution.address}</div>
            <div className="small">{[r.institution.phone && `Ph ${r.institution.phone}`, r.institution.email, r.institution.board && `${r.institution.board}${r.institution.affiliationNo ? ` Affiliation ${r.institution.affiliationNo}` : ""}`].filter(Boolean).join(" · ")}</div>
            {r.institution.header && <div className="small">{r.institution.header}</div>}</div>
        </header>
        <div className="rc-title">FEE RECEIPT</div>
        <div className="rc-meta">
          <div><span>Receipt no</span><b>{r.receiptNo}</b></div><div><span>Date</span><b>{fmtDate(r.issuedAt)}, {time}</b></div>
          <div><span>Student</span><b>{r.student.name}</b></div><div><span>Admission no</span><b>{r.student.admissionNo}</b></div>
          <div><span>Class</span><b>{r.student.className || "—"}{r.student.rollNo ? ` · Roll ${r.student.rollNo}` : ""}</b></div><div><span>Parent</span><b>{r.student.guardian || "—"}</b></div>
        </div>
        <table className="rc-lines"><thead><tr><th>#</th><th>Particulars</th><th>Period</th><th className="num">Amount (₹)</th></tr></thead>
          <tbody>{r.lines.map((l: any, i: number) => <tr key={i}><td>{i + 1}</td><td>{l.feeHead}</td><td>{l.period} ({l.year})</td><td className="num">{(l.amountPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>)}
            {r.finePaise > 0 && <tr><td>{r.lines.length + 1}</td><td>Late fine</td><td /><td className="num">{(r.finePaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>}</tbody>
          <tfoot><tr><td colSpan={3}>Total</td><td className="num">{inr2(r.totalPaise)}</td></tr></tfoot></table>
        <div className="rc-words">{r.inWords}</div>
        <div className="rc-meta">
          <div><span>Paid by</span><b>{MODE[r.mode] || r.mode}{r.referenceNo ? ` · ${r.referenceNo}` : ""}</b></div>
          {r.bankName && <div><span>Bank</span><b>{r.bankName}{r.chequeDate ? ` · dated ${fmtDate(r.chequeDate)}` : ""}</b></div>}
          <div><span>Balance due after this</span><b>{inr2(r.balanceAfterPaise)}</b></div>
          {r.remarks && <div><span>Remarks</span><b>{r.remarks}</b></div>}
        </div>
        {["cheque", "dd"].includes(r.mode) && <div className="small rc-note">Subject to realisation of the {r.mode === "dd" ? "demand draft" : "cheque"}.</div>}
        {r.status === "cancelled" && <div className="small rc-note bad-text">Cancelled on {fmtDate(r.cancelledAt)}: {r.cancelReason}</div>}
        <footer className="rc-foot"><div className="small">{r.institution.footer || ""}<br />This is a computer-generated receipt.</div><div className="sign">Received by<br /><b>{r.collectedBy}</b></div></footer>
      </div>
    </div>
  );
}
