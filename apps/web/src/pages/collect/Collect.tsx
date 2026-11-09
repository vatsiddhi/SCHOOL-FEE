import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { can, fmtDate, http, inr2, toPaise, type User } from "../../lib/api";

type Due = { id: string; periodLabel: string; year: string; feeHead: string; dueDate: string; netPaise: number; paidPaise: number; balancePaise: number; finePaise: number; overdue: boolean };
type Stu = { id: string; admissionNo: string; name: string; className: string | null; rollNo: string | null; guardian: string; guardianPhone: string; status: string; dues: Due[]; recent: any[] };
const MODES: [string, string][] = [["cash", "Cash"], ["upi", "UPI"], ["cheque", "Cheque"], ["dd", "DD"], ["card", "Card"], ["neft", "Bank transfer"]];

export default function Collect() {
  const { user } = useOutletContext<{ user: User }>();
  const [params, setParams] = useSearchParams(); const nav = useNavigate();
  const [q, setQ] = useState(""); const [hits, setHits] = useState<any[]>([]); const [hi, setHi] = useState(0);
  const [s, setS] = useState<Stu | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState(""); const [touched, setTouched] = useState(false);
  const [mode, setMode] = useState("cash"); const [ref, setRef] = useState(""); const [bank, setBank] = useState(""); const [chqDate, setChqDate] = useState("");
  const [tendered, setTendered] = useState(""); const [remarks, setRemarks] = useState("");
  const [waive, setWaive] = useState(false); const [waiveAmt, setWaiveAmt] = useState(""); const [waiveReason, setWaiveReason] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const sid = params.get("student");

  useEffect(() => { if (!q.trim()) { setHits([]); return; } const t = setTimeout(() => http.get<any[]>(`/api/students?q=${encodeURIComponent(q)}`).then(r => { setHits(r.slice(0, 8)); setHi(0); }), 200); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    if (!sid) { setS(null); setTimeout(() => searchRef.current?.focus(), 50); return; }
    http.get<Stu>(`/api/collect/student/${sid}`).then(r => {
      setS(r); setErr(""); setTouched(false); setWaive(false); setWaiveAmt(""); setWaiveReason(""); setRef(""); setBank(""); setChqDate(""); setTendered(""); setRemarks("");
      // default: everything due up to today; if nothing overdue, the next instalment
      const due = r.dues.filter(d => d.overdue);
      setSel(new Set((due.length ? due : r.dues.filter(d => d.dueDate === r.dues[0]?.dueDate)).map(d => d.id)));
    }).catch(e => setErr(e.message));
  }, [sid]);

  const chosen = useMemo(() => s?.dues.filter(d => sel.has(d.id)) || [], [s, sel]);
  const fee = chosen.reduce((t, d) => t + d.balancePaise, 0);
  const fine = chosen.reduce((t, d) => t + d.finePaise, 0);
  const waived = waive ? Math.min(toPaise(waiveAmt || 0), fine) : 0;
  const payable = fee + fine - waived;
  useEffect(() => { if (!touched) setAmount(payable ? String(payable / 100) : ""); }, [payable, touched]);
  const amt = toPaise(amount);
  const change = mode === "cash" && tendered ? toPaise(tendered) - amt : 0;

  // group dues by period for the table
  const groups = useMemo(() => { const m = new Map<string, Due[]>(); for (const d of s?.dues || []) { const k = `${d.year} · ${d.periodLabel}`; m.set(k, [...(m.get(k) || []), d]); } return [...m.entries()]; }, [s]);
  const toggle = (ids: string[], on: boolean) => { const n = new Set(sel); ids.forEach(i => (on ? n.add(i) : n.delete(i))); setSel(n); setTouched(false); };

  async function submit() {
    if (!s) return; setErr("");
    if (amt <= 0) return setErr("Enter the amount received");
    if (amt > payable) return setErr(`Amount is more than the total due (${inr2(payable)})`);
    if (mode === "cash" && tendered && change < 0) return setErr("Cash given is less than the amount");
    setBusy(true);
    try {
      const r = await http.post<any>("/api/collect", { studentId: s.id, demandIds: [...sel], amountPaise: amt, mode, referenceNo: ref || undefined, bankName: bank || undefined, chequeDate: chqDate || undefined, remarks: remarks || undefined, fineWaivePaise: waived, waiveReason: waive ? waiveReason : undefined });
      nav(`/receipts/${r.id}?new=1`);
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }
  const pick = (h: any) => { setQ(""); setHits([]); setParams({ student: h.id }); };

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Collect fees</h1><p className="muted">Search a student, tick the dues being paid, choose how they're paying.</p></div>
        <Link to="/collections" className="secondary sm btnlink">Today's collection</Link></div>

      <div className="search-wrap">
        <input ref={searchRef} className="big-search" placeholder="Search by name, admission number or parent's mobile…" value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === "ArrowDown") setHi(Math.min(hi + 1, hits.length - 1)); if (e.key === "ArrowUp") setHi(Math.max(hi - 1, 0)); if (e.key === "Enter" && hits[hi]) pick(hits[hi]); }} />
        {hits.length > 0 && <div className="results">{hits.map((h, i) => (
          <button key={h.id} className={"result" + (i === hi ? " hi" : "")} onMouseEnter={() => setHi(i)} onClick={() => pick(h)}>
            <span><b>{h.name}</b> <span className="muted">· {h.admissionNo} · {h.className ? `${h.className}${h.section ? "-" + h.section : ""}` : ""}</span><div className="muted small">{h.guardian} · {h.guardianPhone}</div></span>
            <span className={h.outstandingPaise > 0 ? "pill due" : "pill clear"}>{h.outstandingPaise > 0 ? inr2(h.outstandingPaise) : "Paid"}</span>
          </button>))}</div>}
      </div>

      {err && !s && <div className="alert">{err}</div>}
      {s && (
        <div className="collect-grid">
          <div className="stack">
            <section className="panel card-pad student-card">
              <div className="row-between">
                <div><h2 style={{ margin: 0 }}>{s.name}</h2><div className="muted">Adm. {s.admissionNo}{s.className && ` · ${s.className}`}{s.rollNo && ` · Roll ${s.rollNo}`}</div>
                  <div className="muted small">{s.guardian} · {s.guardianPhone}</div></div>
                <div className="row-gap"><Link to={`/students/${s.id}`} className="ghost">Ledger</Link><button className="secondary sm" onClick={() => setParams({})}>Change student</button></div>
              </div>
              {s.status !== "active" && <div className="alert">This student is marked {s.status.replace("_", " ")}.</div>}
            </section>
            <section className="panel">
              <div className="row-between pad"><h3>Dues</h3>{s.dues.length > 0 && <span className="row-gap"><button className="ghost" onClick={() => toggle(s.dues.map(d => d.id), true)}>Select all</button><button className="ghost" onClick={() => setSel(new Set())}>Clear</button></span>}</div>
              {s.dues.length === 0 ? <p className="pad muted">No dues. Everything is paid.</p> : (
                <table className="dues"><thead><tr><th style={{ width: 36 }} /><th>Fee head</th><th>Due date</th><th className="num">Balance</th><th className="num">Late fine</th></tr></thead>
                  {groups.map(([k, ds]) => { const all = ds.every(d => sel.has(d.id)); return (
                    <tbody key={k}>
                      <tr className="group" onClick={() => toggle(ds.map(d => d.id), !all)}><td><input type="checkbox" checked={all} readOnly /></td><td colSpan={2}><b>{k}</b>{ds[0].overdue && <span className="pill bad" style={{ marginLeft: 8 }}>Overdue</span>}</td>
                        <td className="num"><b>{inr2(ds.reduce((t, d) => t + d.balancePaise, 0))}</b></td><td className="num">{ds.some(d => d.finePaise) ? inr2(ds.reduce((t, d) => t + d.finePaise, 0)) : "—"}</td></tr>
                      {ds.map(d => <tr key={d.id} onClick={() => toggle([d.id], !sel.has(d.id))} className="click"><td><input type="checkbox" checked={sel.has(d.id)} readOnly /></td><td>{d.feeHead}{d.paidPaise > 0 && <span className="muted small"> (part paid {inr2(d.paidPaise)})</span>}</td><td>{fmtDate(d.dueDate)}</td><td className="num">{inr2(d.balancePaise)}</td><td className="num">{d.finePaise ? <span className="bad-text">{inr2(d.finePaise)}</span> : "—"}</td></tr>)}
                    </tbody>); })}
                </table>)}
            </section>
            {s.recent.length > 0 && <section className="panel"><h3 className="pad">Recent receipts</h3><table><tbody>{s.recent.map(r => <tr key={r.id}><td><Link to={`/receipts/${r.id}`}>{r.receiptNo}</Link></td><td>{fmtDate(r.paidAt)}</td><td className="cap">{r.mode}</td><td className="num">{inr2(r.amountPaise)}</td></tr>)}</tbody></table></section>}
          </div>

          <section className="panel card-pad pay-box">
            <h3>Payment</h3>
            <div className="sum"><span>Fees selected</span><span>{inr2(fee)}</span></div>
            <div className="sum"><span>Late fine</span><span>{inr2(fine)}</span></div>
            {fine > 0 && can(user, "approve") && <label className="check"><input type="checkbox" checked={waive} onChange={e => { setWaive(e.target.checked); setWaiveAmt(e.target.checked ? String(fine / 100) : ""); setTouched(false); }} /> Waive late fine</label>}
            {waive && <div className="grid2"><label className="field"><span>Waive amount</span><input type="number" min="0" step="0.01" value={waiveAmt} onChange={e => { setWaiveAmt(e.target.value); setTouched(false); }} /></label>
              <label className="field"><span>Reason<em className="req">*</em></span><input value={waiveReason} onChange={e => setWaiveReason(e.target.value)} placeholder="Parent hospitalised" /></label></div>}
            {waived > 0 && <div className="sum"><span>Fine waived</span><span>−{inr2(waived)}</span></div>}
            <div className="sum total"><span>Total payable</span><span>{inr2(payable)}</span></div>

            <label className="field"><span>Amount received (₹)</span><input className="amount" type="number" min="0" step="0.01" value={amount} onChange={e => { setAmount(e.target.value); setTouched(true); }} /></label>
            {amt > 0 && amt < payable && <div className="muted small">Part payment. The fine is settled first, then the oldest dues. {inr2(payable - amt)} stays due.</div>}

            <div className="field"><span>Payment mode</span><div className="modes">{MODES.map(([v, l]) => <button key={v} type="button" className={"mode" + (mode === v ? " on" : "")} onClick={() => setMode(v)}>{l}</button>)}</div></div>
            {mode === "cash" && <label className="field"><span>Cash given (optional)</span><input type="number" min="0" value={tendered} onChange={e => setTendered(e.target.value)} />{tendered && <small className={change < 0 ? "bad-text" : "muted"}>{change >= 0 ? `Return ${inr2(change)}` : `Short by ${inr2(-change)}`}</small>}</label>}
            {["upi", "card", "neft"].includes(mode) && <label className="field"><span>{mode === "upi" ? "UPI transaction ID (UTR)" : "Transaction reference"}<em className="req">*</em></span><input value={ref} onChange={e => setRef(e.target.value)} /></label>}
            {["cheque", "dd"].includes(mode) && <div className="grid2">
              <label className="field"><span>{mode === "dd" ? "DD" : "Cheque"} number<em className="req">*</em></span><input value={ref} onChange={e => setRef(e.target.value)} /></label>
              <label className="field"><span>Date<em className="req">*</em></span><input type="date" value={chqDate} onChange={e => setChqDate(e.target.value)} /></label>
              <label className="field span2"><span>Bank and branch<em className="req">*</em></span><input value={bank} onChange={e => setBank(e.target.value)} /></label></div>}
            <label className="field"><span>Remarks</span><input value={remarks} onChange={e => setRemarks(e.target.value)} /></label>
            {err && <div className="alert">{err}</div>}
            <button className="primary btn collect-btn" disabled={busy || !sel.size || amt <= 0} onClick={submit}>{busy ? "Saving…" : `Collect ${amt > 0 ? inr2(amt) : ""} & print receipt`}</button>
          </section>
        </div>
      )}
    </div>
  );
}
