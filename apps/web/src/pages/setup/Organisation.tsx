import { useEffect, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import { FieldInput, fromRow, type Field } from "../../components/CrudPage";
import { can, http, type User } from "../../lib/api";

const STATES = ["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry"];

const SECTIONS: { title: string; fields: Field[] }[] = [
  { title: "Basic details", fields: [
    { name: "name", label: "Institution name", required: true, span: 2 }, { name: "shortName", label: "Short name" },
    { name: "type", label: "Type", type: "select", required: true, options: [["school","School"],["college","College"],["coaching","Coaching centre"],["university","University"],["training","Training institute"],["other","Other"]].map(([value,label]) => ({ value, label })) },
    { name: "board", label: "Board / university", placeholder: "CBSE, ICSE, BSE Odisha, Utkal University" }, { name: "affiliationNo", label: "Affiliation number" },
    { name: "udiseCode", label: "UDISE+ code (schools)" }, { name: "aisheCode", label: "AISHE code (colleges)" },
  ] },
  { title: "Contact and address", fields: [
    { name: "addressLine", label: "Address", span: 2 }, { name: "city", label: "City / town" }, { name: "district", label: "District" },
    { name: "state", label: "State", type: "select", options: STATES.map(s => ({ value: s, label: s })) }, { name: "pincode", label: "PIN code" },
    { name: "phone", label: "Phone" }, { name: "email", label: "Email", type: "email" }, { name: "website", label: "Website", span: 2 },
  ] },
  { title: "Tax and legal", fields: [
    { name: "trustName", label: "Trust / society name", span: 2 }, { name: "registrationNo", label: "Registration number" },
    { name: "pan", label: "PAN" }, { name: "gstin", label: "GSTIN" },
  ] },
  { title: "Receipts and branding", fields: [
    { name: "receiptPrefix", label: "Receipt prefix", required: true, help: "Receipts are numbered like DPS/2026-27/000001" },
    { name: "themeColor", label: "Theme colour", placeholder: "#4338ca" }, { name: "logoUrl", label: "Logo URL", span: 2 },
    { name: "receiptHeader", label: "Receipt header line", span: 2 }, { name: "receiptFooter", label: "Receipt footer / terms", span: 2 },
  ] },
];
const ALL = SECTIONS.flatMap(s => s.fields);

export default function Organisation() {
  const { user } = useOutletContext<{ user: User }>();
  const [v, setV] = useState<Record<string, any> | null>(null);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const editable = can(user, "org.write");

  useEffect(() => { http.get<any>("/api/setup/organisation").then(r => setV(fromRow(ALL, r))).catch(e => setErr(e.message)); }, []);

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(""); setMsg("");
    try {
      const body: Record<string, any> = {};
      for (const f of ALL) body[f.name] = v![f.name] === "" ? null : v![f.name];
      await http.put("/api/setup/organisation", body); setMsg("Saved");
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }
  if (!v) return <p className="muted">{err || "Loading…"}</p>;
  return (
    <form onSubmit={save} className="stack">
      <div className="page-head"><div><h1>Organisation</h1><p className="muted">Shown on receipts and reports.</p></div>
        {editable && <button className="primary btn" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>}</div>
      {err && <div className="alert">{err}</div>}{msg && <div className="ok-msg">{msg}</div>}
      <fieldset disabled={!editable} className="plain">
        {SECTIONS.map(s => (
          <section key={s.title} className="panel form-panel">
            <h3>{s.title}</h3>
            <div className="grid2">{s.fields.map(f => <FieldInput key={f.name} f={f} value={v[f.name]} onChange={x => setV({ ...v, [f.name]: x })} />)}</div>
          </section>
        ))}
      </fieldset>
    </form>
  );
}
