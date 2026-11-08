import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { http } from "../../lib/api";

type P = Record<string, number | boolean>;
export default function SetupHome() {
  const [p, setP] = useState<P | null>(null);
  useEffect(() => { http.get<P>("/api/setup/progress").then(setP); }, []);
  if (!p) return <p className="muted">Loading…</p>;
  const steps: [string, string, boolean, string][] = [
    ["Organisation", "/setup/organisation", !!p.organisation, "Name, address, tax details, receipt prefix"],
    ["Academic years", "/setup/academic-years", (p.years as number) > 0, `${p.years} year(s)`],
    ["Classes / courses", "/setup/classes", (p.units as number) > 0, `${p.units} active`],
    ["Sections", "/setup/sections", (p.sections as number) > 0, `${p.sections} sections`],
    ["Fee types", "/setup/fee-types", (p.types as number) > 0, `${p.types} types`],
    ["Fee heads", "/setup/fee-heads", (p.heads as number) > 0, `${p.heads} active heads`],
    ["Bank accounts", "/setup/bank-accounts", (p.banks as number) > 0, `${p.banks} account(s)`],
    ["Fee structures", "/setup/fee-structures", (p.structures as number) > 0, `${p.structures} structures`],
    ["Concessions and late fines", "/setup/concessions", true, "Optional"],
    ["Staff and roles", "/staff", (p.staff as number) > 1, `${p.staff} staff`],
  ];
  const done = steps.filter(s => s[2]).length;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Setup checklist</h1><p className="muted">{done} of {steps.length} steps complete</p></div></div>
      <div className="progress"><div style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <section className="panel">
        <ol className="steps">{steps.map(([t, to, ok, d], i) => (
          <li key={t}><span className={"dot" + (ok ? " ok" : "")}>{ok ? "✓" : i + 1}</span>
            <div><Link to={to}><b>{t}</b></Link><div className="muted small">{d}</div></div>
            <Link to={to} className="secondary sm btnlink">{ok ? "Review" : "Start"}</Link></li>
        ))}</ol>
      </section>
      <p className="muted small">Coming next: transport, hostel, library and the books & uniform store.</p>
    </div>
  );
}
