import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { can, http, inr, type User } from "../../lib/api";
import { useList } from "../../lib/useList";

export default function FeeMapping() {
  const { user } = useOutletContext<{ user: User }>();
  const years = useList<any>("/api/setup/academic-years");
  const [yearId, setYearId] = useState(""); const [rows, setRows] = useState<any[] | null>(null);
  const [preview, setPreview] = useState<Record<string, any>>({}); const [busy, setBusy] = useState(""); const [fromDate, setFromDate] = useState("");
  const year = yearId || years.find(y => y.isCurrent)?.id || "";
  const load = useCallback(() => { if (year) http.get<any[]>(`/api/dues/overview?academicYearId=${year}`).then(setRows); }, [year]);
  useEffect(load, [load]);

  async function gen(unitId: string | undefined, dryRun: boolean) {
    const key = unitId || "all"; setBusy(key);
    try {
      const r = await http.post<any>("/api/dues/generate", { academicYearId: year, unitId, dryRun, ...(fromDate ? { fromDate } : {}) });
      setPreview(p => ({ ...p, [key]: { ...r, dryRun } })); if (!dryRun) load();
    } catch (x) { alert((x as Error).message); } finally { setBusy(""); }
  }
  const write = can(user, "setup.write");
  const Result = ({ k }: { k: string }) => { const p = preview[k]; if (!p) return null;
    return <div className="small">{p.dryRun ? "Will create" : "Created"} <b>{p.created}</b> dues ({inr(p.totalPaise)}) for {p.students} students{p.skipped ? `, ${p.skipped} already exist` : ""}{p.noStructure.length ? <span className="bad-text"> · No structure for {p.noStructure.length}: {p.noStructure.slice(0, 5).join(", ")}</span> : null}</div>; };

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Fee mapping & dues</h1><p className="muted">Students get their class's fee structure automatically. Override one student from their profile. Then generate dues.</p></div></div>
      <div className="toolbar">
        <select value={year} onChange={e => setYearId(e.target.value)} style={{ maxWidth: 180 }}>{years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</select>
        <label className="check">Skip instalments due before <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ width: 170 }} /></label>
        {write && <><button className="secondary" onClick={() => gen(undefined, true)} disabled={!!busy}>Preview all classes</button><button className="primary btn" onClick={() => confirm("Generate dues for every class?") && gen(undefined, false)} disabled={!!busy}>Generate for all</button></>}
      </div>
      <Result k="all" />
      <section className="panel">{!rows ? <p className="muted pad">Loading…</p> : (
        <table><thead><tr><th>Class</th><th>Students</th><th>Fee structure(s)</th><th>Dues generated</th><th /></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.unitId}><td><b>{r.unit}</b></td><td>{r.students}</td>
              <td>{r.structures.length ? r.structures.map((s: any) => <div key={s.id}>{s.name}{s.category && <span className="muted small"> ({s.category})</span>}</div>) : <Link to="/setup/fee-structures" className="bad-text">None — create one</Link>}</td>
              <td>{r.students ? <span className={r.withDues === r.students ? "pill clear" : "pill due"}>{r.withDues} of {r.students}</span> : "—"}<Result k={r.unitId} /></td>
              <td className="actions">{write && r.students > 0 && r.structures.length > 0 && <><button className="ghost" onClick={() => gen(r.unitId, true)} disabled={!!busy}>Preview</button><button className="ghost" onClick={() => gen(r.unitId, false)} disabled={!!busy}>{busy === r.unitId ? "…" : "Generate"}</button></>}</td></tr>))}
          </tbody></table>)}
      </section>
      <p className="muted small">Generating is safe to repeat: dues that already exist are never duplicated or changed.</p>
    </div>
  );
}
