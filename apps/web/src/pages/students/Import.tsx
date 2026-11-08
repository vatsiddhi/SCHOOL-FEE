import { useState } from "react";
import { Link } from "react-router-dom";
import { http } from "../../lib/api";
import { useList } from "../../lib/useList";

const COLS = ["admissionNo", "firstName", "lastName", "gender", "dob", "className", "section", "rollNo", "category", "fatherName", "motherName", "guardianPhone", "email", "address"];
const SAMPLE = COLS.join(",") + "\nDPS701,Ishita,Mishra,female,14-03-2014,Class 7,A,1,general,Sanjay Mishra,Rita Mishra,9861234567,,Saheed Nagar\n";

/** Minimal CSV parser with quoted fields */
function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

export default function Import() {
  const years = useList<any>("/api/setup/academic-years");
  const [yearId, setYearId] = useState(""); const [rows, setRows] = useState<Record<string, string>[]>([]); const [file, setFile] = useState("");
  const [res, setRes] = useState<any>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const year = yearId || years.find(y => y.isCurrent)?.id || "";

  async function onFile(f: File) {
    setErr(""); setRes(null); setFile(f.name);
    if (!/\.csv$/i.test(f.name)) { setErr("Save the Excel sheet as CSV (File → Save As → CSV) and upload that file."); return; }
    const data = parseCSV(await f.text());
    const head = data[0].map(h => h.trim());
    const missing = ["admissionNo", "firstName", "className", "guardianPhone"].filter(c => !head.includes(c));
    if (missing.length) { setErr(`Missing columns: ${missing.join(", ")}. Download the template for the right headings.`); return; }
    const parsed = data.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
    setRows(parsed);
    await run(parsed, true);
  }
  async function run(list = rows, dryRun: boolean) {
    setBusy(true); setErr("");
    try { setRes(await http.post("/api/students/import", { academicYearId: year, rows: list, dryRun })); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }
  const template = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([SAMPLE], { type: "text/csv" })); a.download = "feedesk-students-template.csv"; a.click(); };

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Import students</h1><p className="muted">Upload a CSV saved from Excel. We check every row before anything is saved.</p></div></div>
      <section className="panel form-panel">
        <div className="grid2">
          <label className="field"><span>Academic year</span><select value={year} onChange={e => setYearId(e.target.value)}>{years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
          <div className="field"><span>Template</span><button type="button" className="secondary" onClick={template}>Download CSV template</button></div>
        </div>
        <label className="drop"><input type="file" accept=".csv,text/csv" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} /><b>{file || "Choose a CSV file"}</b><span className="muted small">Columns: {COLS.join(", ")}. Dates as DD-MM-YYYY. Class names must match your setup exactly.</span></label>
        {err && <div className="alert">{err}</div>}
        {busy && <p className="muted">Checking…</p>}
        {res && !res.imported && <>
          <div className={res.errors.length ? "alert" : "ok-msg"}>{res.valid} rows are valid{res.errors.length ? `, ${res.errors.length} have problems. Fix them in the file and upload again.` : ". Ready to import."}</div>
          {res.errors.length > 0 && <table className="mini"><tbody>{res.errors.slice(0, 50).map((e: any) => <tr key={e.row}><td>Row {e.row}</td><td>{e.error}</td></tr>)}</tbody></table>}
          {!res.errors.length && res.valid > 0 && <button className="primary btn" onClick={() => run(rows, false)} disabled={busy}>Import {res.valid} students</button>}
        </>}
        {res?.imported > 0 && <div className="ok-msg">{res.imported} students imported. <Link to="/setup/fee-mapping">Generate their dues next →</Link></div>}
      </section>
    </div>
  );
}
