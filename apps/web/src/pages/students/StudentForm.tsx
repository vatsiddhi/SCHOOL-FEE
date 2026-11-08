import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { http, isoDate } from "../../lib/api";
import { useList } from "../../lib/useList";

type G = { name: string; relation: string; phone: string; email: string; occupation: string };
const emptyG = (relation: string): G => ({ name: "", relation, phone: "", email: "", occupation: "" });

export default function StudentForm() {
  const { id } = useParams(); const nav = useNavigate();
  const years = useList<any>("/api/setup/academic-years");
  const units = useList<any>("/api/setup/units");
  const sections = useList<any>("/api/setup/sections");
  const [s, setS] = useState<Record<string, any>>({ admissionNo: "", firstName: "", lastName: "", gender: "", dob: "", category: "", isRte: false, phone: "", email: "", address: "", bloodGroup: "", apaarId: "", aadhaarLast4: "", admittedOn: isoDate(new Date()) });
  const [e, setE] = useState<Record<string, any>>({ academicYearId: "", unitId: "", sectionId: "", rollNo: "", feeCategory: "" });
  const [gs, setGs] = useState<G[]>([emptyG("father"), emptyG("mother")]);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => { if (!id && !e.academicYearId && years.length) setE(x => ({ ...x, academicYearId: years.find(y => y.isCurrent)?.id || years[0].id })); }, [years, id, e.academicYearId]);
  useEffect(() => {
    if (!id) return;
    http.get<any>(`/api/students/${id}`).then(r => {
      setS({ admissionNo: r.admissionNo, firstName: r.firstName, lastName: r.lastName || "", gender: r.gender || "", dob: isoDate(r.dob), category: r.category || "", isRte: r.isRte, phone: r.phone || "", email: r.email || "", address: r.address || "", bloodGroup: r.bloodGroup || "", apaarId: r.apaarId || "", aadhaarLast4: r.aadhaarLast4 || "", admittedOn: isoDate(r.admittedOn) });
      const en = r.enrollments[0];
      if (en) setE({ academicYearId: en.academicYearId, unitId: en.unitId, sectionId: en.sectionId || "", rollNo: en.rollNo || "", feeCategory: en.feeCategory || "" });
      setGs(r.guardians.map((g: any) => ({ name: g.guardian.name, relation: g.guardian.relation, phone: g.guardian.phone, email: g.guardian.email || "", occupation: g.guardian.occupation || "" })));
    });
  }, [id]);

  async function save(ev: FormEvent) {
    ev.preventDefault(); setBusy(true); setErr("");
    const nul = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v]));
    const body = { student: nul(s), enrollment: nul(e), guardians: gs.filter(g => g.name || g.phone).map(g => nul(g)) };
    try {
      const r: any = id ? await http.put(`/api/students/${id}`, body) : await http.post("/api/students", body);
      nav(`/students/${id || r.id}`);
    } catch (x) { setErr((x as Error).message); setBusy(false); window.scrollTo(0, 0); }
  }
  const S = (k: string) => ({ value: s[k] ?? "", onChange: (ev: any) => setS({ ...s, [k]: ev.target.value }) });
  const E = (k: string) => ({ value: e[k] ?? "", onChange: (ev: any) => setE({ ...e, [k]: ev.target.value, ...(k === "unitId" ? { sectionId: "" } : {}) }) });
  const setG = (i: number, k: keyof G, v: string) => setGs(gs.map((g, j) => (j === i ? { ...g, [k]: v } : g)));

  return (
    <form className="stack" onSubmit={save}>
      <div className="page-head"><div><h1>{id ? "Edit student" : "New admission"}</h1></div>
        <div className="row-gap"><button type="button" className="secondary" onClick={() => nav(-1)}>Cancel</button><button className="primary btn" disabled={busy}>{busy ? "Saving…" : "Save student"}</button></div></div>
      {err && <div className="alert">{err}</div>}
      <section className="panel form-panel"><h3>Student</h3><div className="grid3">
        <label className="field"><span>Admission no<em className="req">*</em></span><input required {...S("admissionNo")} /></label>
        <label className="field"><span>First name<em className="req">*</em></span><input required {...S("firstName")} /></label>
        <label className="field"><span>Last name</span><input {...S("lastName")} /></label>
        <label className="field"><span>Gender</span><select {...S("gender")}><option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label>
        <label className="field"><span>Date of birth</span><input type="date" {...S("dob")} /></label>
        <label className="field"><span>Category</span><select {...S("category")}><option value="">—</option>{["general", "obc", "sc", "st", "ews"].map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}</select></label>
        <label className="field"><span>Admitted on</span><input type="date" {...S("admittedOn")} /></label>
        <label className="field"><span>Blood group</span><select {...S("bloodGroup")}><option value="">—</option>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="field"><span>APAAR ID</span><input {...S("apaarId")} /></label>
        <label className="field"><span>Aadhaar (last 4 digits)</span><input maxLength={4} inputMode="numeric" {...S("aadhaarLast4")} /></label>
        <label className="field"><span>Student mobile</span><input {...S("phone")} /></label>
        <label className="field"><span>Email</span><input type="email" {...S("email")} /></label>
        <label className="field span3"><span>Address</span><input {...S("address")} /></label>
        <label className="check"><input type="checkbox" checked={!!s.isRte} onChange={ev => setS({ ...s, isRte: ev.target.checked })} /> RTE admission (25% quota)</label>
      </div></section>

      <section className="panel form-panel"><h3>Class</h3><div className="grid3">
        <label className="field"><span>Academic year<em className="req">*</em></span><select required {...E("academicYearId")}>{years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
        <label className="field"><span>Class / course<em className="req">*</em></span><select required {...E("unitId")}><option value="">Select…</option>{units.filter(u => u.isActive).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label className="field"><span>Section</span><select {...E("sectionId")}><option value="">—</option>{sections.filter(x => x.unitId === e.unitId).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="field"><span>Roll no</span><input {...E("rollNo")} /></label>
        <label className="field"><span>Fee category</span><select {...E("feeCategory")}><option value="">Standard</option><option value="new">New admission</option><option value="old">Existing student</option><option value="management">Management quota</option><option value="hosteller">Hosteller</option><option value="day_scholar">Day scholar</option><option value="nri">NRI</option></select></label>
      </div></section>

      <section className="panel form-panel"><div className="row-between"><h3>Parents / guardians</h3><button type="button" className="secondary sm" onClick={() => setGs([...gs, emptyG("guardian")])}>+ Add guardian</button></div>
        <p className="muted small" style={{ margin: 0 }}>The first one is the primary contact. Siblings sharing a parent's mobile are linked automatically.</p>
        {gs.map((g, i) => (
          <div key={i} className="grid3 guardian">
            <label className="field"><span>Relation</span><select value={g.relation} onChange={ev => setG(i, "relation", ev.target.value)}><option value="father">Father</option><option value="mother">Mother</option><option value="guardian">Guardian</option></select></label>
            <label className="field"><span>Name{i === 0 && <em className="req">*</em>}</span><input required={i === 0} value={g.name} onChange={ev => setG(i, "name", ev.target.value)} /></label>
            <label className="field"><span>Mobile{i === 0 && <em className="req">*</em>}</span><input required={i === 0 || !!g.name} inputMode="numeric" maxLength={10} value={g.phone} onChange={ev => setG(i, "phone", ev.target.value)} /></label>
            <label className="field"><span>Email</span><input type="email" value={g.email} onChange={ev => setG(i, "email", ev.target.value)} /></label>
            <label className="field"><span>Occupation</span><input value={g.occupation} onChange={ev => setG(i, "occupation", ev.target.value)} /></label>
            {gs.length > 1 && <button type="button" className="ghost danger" style={{ alignSelf: "end" }} onClick={() => setGs(gs.filter((_, j) => j !== i))}>Remove</button>}
          </div>))}
      </section>
    </form>
  );
}
