import { useOutletContext } from "react-router-dom";
import CrudPage, { type Field } from "../../components/CrudPage";
import { can, fmtDate, inr2, type User } from "../../lib/api";
import { useList, clearLists } from "../../lib/useList";
import { useEffect } from "react";

const useUser = () => useOutletContext<{ user: User }>().user;
const opt = (rows: any[], label = (r: any) => r.name) => rows.filter(r => r.isActive !== false).map(r => ({ value: r.id, label: label(r) }));
const yes = (b: boolean) => (b ? <span className="pill clear">Yes</span> : <span className="muted">—</span>);
const active = (r: any) => (r.isActive === false ? <span className="pill off">Inactive</span> : <span className="pill clear">Active</span>);
// Dropdown lists must refresh after edits on other pages
const useFresh = () => useEffect(() => clearLists(), []);

export function AcademicYears() {
  const user = useUser();
  const fields: Field[] = [
    { name: "name", label: "Year name", required: true, placeholder: "2027-28", help: "Format: 2026-27" },
    { name: "startDate", label: "Start date", type: "date", required: true },
    { name: "endDate", label: "End date", type: "date", required: true },
    { name: "isCurrent", label: "Current year", type: "checkbox" },
    { name: "isLocked", label: "Locked (no changes allowed)", type: "checkbox" },
  ];
  return <CrudPage title="Academic years" subtitle="One year is marked current. Lock a year once it is closed." endpoint="/api/setup/academic-years" canWrite={can(user, "setup.write")}
    fields={fields} defaults={{ startDate: "2027-04-01", endDate: "2028-03-31" }}
    columns={[{ label: "Year", render: r => <b>{(r as any).name}</b> }, { label: "From", render: (r: any) => fmtDate(r.startDate) }, { label: "To", render: (r: any) => fmtDate(r.endDate) },
      { label: "Status", render: (r: any) => <>{r.isCurrent && <span className="pill brand">Current</span>} {r.isLocked && <span className="pill off">Locked</span>}</> }]} />;
}

export function Classes() {
  const user = useUser(); useFresh();
  const units = useList<any>("/api/setup/units");
  const fields: Field[] = [
    { name: "name", label: "Name", required: true, placeholder: "Class 7 / B.Com Sem 1 / JEE 2027 Batch A" },
    { name: "kind", label: "Type", type: "select", required: true, options: [{ value: "class", label: "Class (school)" }, { value: "course", label: "Course" }, { value: "semester", label: "Semester / Year" }, { value: "batch", label: "Batch (coaching)" }] },
    { name: "stream", label: "Stream", type: "select", options: ["Science", "Commerce", "Arts", "Vocational"].map(s => ({ value: s, label: s })) },
    { name: "sortOrder", label: "Display order", type: "number" },
    { name: "nextUnitId", label: "Promotes to", type: "select", options: () => opt(units), help: "Used at year-end promotion" },
  ];
  const nameOf = (id: string) => units.find(u => u.id === id)?.name || "—";
  return <CrudPage title="Classes / courses" subtitle="Classes for schools, courses or semesters for colleges, batches for coaching." endpoint="/api/setup/units" canWrite={can(user, "setup.write")}
    fields={fields} defaults={{ kind: "class", sortOrder: units.length }}
    columns={[{ label: "Order", render: (r: any) => r.sortOrder }, { label: "Name", render: (r: any) => <b>{r.name}</b> }, { label: "Type", render: (r: any) => <span className="cap">{r.kind}</span> },
      { label: "Stream", render: (r: any) => r.stream || "—" }, { label: "Sections", render: (r: any) => r._count?.sections ?? 0 }, { label: "Promotes to", render: (r: any) => (r.nextUnitId ? nameOf(r.nextUnitId) : "—") }, { label: "Status", render: active }]} />;
}

export function Sections() {
  const user = useUser(); useFresh();
  const units = useList<any>("/api/setup/units");
  const fields: Field[] = [
    { name: "unitId", label: "Class", type: "select", required: true, options: () => opt(units), hideInEdit: true },
    { name: "name", label: "Section", required: true, placeholder: "A" },
    { name: "capacity", label: "Capacity", type: "number" },
    { name: "classTeacher", label: "Class teacher" },
  ];
  return <CrudPage title="Sections" endpoint="/api/setup/sections" canWrite={can(user, "setup.write")} fields={fields}
    columns={[{ label: "Class", render: (r: any) => r.unit?.name }, { label: "Section", render: (r: any) => <b>{r.name}</b> }, { label: "Capacity", render: (r: any) => r.capacity ?? "—" },
      { label: "Class teacher", render: (r: any) => r.classTeacher || "—" }, { label: "Status", render: active }]} />;
}

export function FeeTypes() {
  const user = useUser();
  return <CrudPage title="Fee types" subtitle="Groups of fee heads, such as Academic, Transport, Hostel or Store." endpoint="/api/setup/fee-types" canWrite={can(user, "setup.write")}
    fields={[{ name: "name", label: "Name", required: true }, { name: "code", label: "Code", required: true, placeholder: "ACA" }, { name: "sortOrder", label: "Display order", type: "number" }]}
    columns={[{ label: "Code", render: (r: any) => <code>{r.code}</code> }, { label: "Name", render: (r: any) => <b>{r.name}</b> }, { label: "Fee heads", render: (r: any) => r._count?.feeHeads ?? 0 }, { label: "Status", render: active }]} />;
}

export function FeeHeads() {
  const user = useUser(); useFresh();
  const types = useList<any>("/api/setup/fee-types");
  const banks = useList<any>("/api/setup/bank-accounts");
  const fields: Field[] = [
    { name: "name", label: "Fee head name", required: true, placeholder: "Tuition Fee" },
    { name: "code", label: "Code", required: true, placeholder: "TUI" },
    { name: "feeTypeId", label: "Fee type", type: "select", options: () => opt(types) },
    { name: "bankAccountId", label: "Credit to bank account", type: "select", options: () => opt(banks, b => b.label) },
    { name: "sortOrder", label: "Display order", type: "number" },
    { name: "hsnSac", label: "SAC / HSN code" },
    { name: "gstApplicable", label: "GST applicable", type: "checkbox" },
    { name: "gstRateBps", label: "GST rate", type: "percent", showIf: v => !!v.gstApplicable },
    { name: "isOptional", label: "Optional (only for students who opt in)", type: "checkbox", span: 2 },
    { name: "isRefundable", label: "Refundable deposit", type: "checkbox" },
    { name: "isTuition", label: "Tuition fee (for 80C certificate)", type: "checkbox" },
    { name: "concessionAllowed", label: "Concession allowed", type: "checkbox" },
    { name: "fineApplicable", label: "Late fine applies", type: "checkbox" },
  ];
  return <CrudPage title="Fee heads" subtitle="The items printed on a receipt." endpoint="/api/setup/fee-heads" canWrite={can(user, "setup.write")} fields={fields}
    defaults={{ concessionAllowed: true, fineApplicable: true }}
    columns={[{ label: "Code", render: (r: any) => <code>{r.code}</code> }, { label: "Fee head", render: (r: any) => <b>{r.name}</b> }, { label: "Type", render: (r: any) => r.feeType?.name || "—" },
      { label: "GST", render: (r: any) => (r.gstApplicable ? `${r.gstRateBps / 100}%` : "—") }, { label: "Optional", render: (r: any) => yes(r.isOptional) },
      { label: "Refundable", render: (r: any) => yes(r.isRefundable) }, { label: "Concession", render: (r: any) => yes(r.concessionAllowed) }, { label: "Fine", render: (r: any) => yes(r.fineApplicable) }]} />;
}

export function Concessions() {
  const user = useUser(); useFresh();
  const heads = useList<any>("/api/setup/fee-heads");
  const fields: Field[] = [
    { name: "name", label: "Concession name", required: true, placeholder: "Sibling concession", span: 2 },
    { name: "type", label: "Type", type: "select", required: true, options: [{ value: "percent", label: "Percentage" }, { value: "flat", label: "Flat amount" }] },
    { name: "feeHeadId", label: "Applies to fee head", type: "select", options: () => opt(heads.filter(h => h.concessionAllowed)), help: "Leave empty for all heads that allow concession" },
    { name: "valueBps", label: "Percentage", type: "percent", showIf: v => v.type === "percent", required: true },
    { name: "valuePaise", label: "Amount per instalment", type: "money", showIf: v => v.type === "flat", required: true },
  ];
  return <CrudPage title="Concessions" subtitle="Sibling, staff ward, merit, scholarship, RTE and others." endpoint="/api/setup/concessions" canWrite={can(user, "setup.write")} fields={fields} defaults={{ type: "percent" }}
    columns={[{ label: "Concession", render: (r: any) => <b>{r.name}</b> }, { label: "Value", render: (r: any) => (r.type === "percent" ? `${r.valueBps / 100}%` : inr2(r.valuePaise)) },
      { label: "Fee head", render: (r: any) => r.feeHead?.name || "All eligible" }, { label: "Students", render: (r: any) => r._count?.students ?? 0 }, { label: "Status", render: active }]} />;
}

export function LateFines() {
  const user = useUser();
  const fields: Field[] = [
    { name: "name", label: "Rule name", required: true, placeholder: "₹10 per day after 10 days", span: 2 },
    { name: "type", label: "Type", type: "select", required: true, options: [{ value: "per_day", label: "Per day" }, { value: "flat", label: "Flat after due date" }] },
    { name: "graceDays", label: "Grace days", type: "number" },
    { name: "amountPaise", label: "Amount", type: "money", required: true, help: "Per day, or one-time for flat" },
    { name: "maxPaise", label: "Maximum fine (cap)", type: "money" },
  ];
  const typeLabel: Record<string, string> = { per_day: "Per day", flat: "Flat", slab: "Slab" };
  return <CrudPage title="Late fine rules" subtitle="Attach a rule to a fee structure. Admins can waive fines with a reason." endpoint="/api/setup/late-fine-rules" canWrite={can(user, "setup.write")} fields={fields} defaults={{ type: "per_day", graceDays: 0 }}
    columns={[{ label: "Rule", render: (r: any) => <b>{r.name}</b> }, { label: "Type", render: (r: any) => typeLabel[r.type] }, { label: "Grace", render: (r: any) => `${r.graceDays} days` },
      { label: "Amount", render: (r: any) => inr2(r.amountPaise), num: true }, { label: "Cap", render: (r: any) => (r.maxPaise ? inr2(r.maxPaise) : "No cap"), num: true }]} />;
}

export function BankAccounts() {
  const user = useUser();
  const fields: Field[] = [
    { name: "label", label: "Label", required: true, placeholder: "Trust main account", span: 2 },
    { name: "bankName", label: "Bank", required: true }, { name: "branch", label: "Branch" },
    { name: "accountNo", label: "Account number", required: true }, { name: "ifsc", label: "IFSC", required: true },
    { name: "isDefault", label: "Default account", type: "checkbox" },
  ];
  return <CrudPage title="Bank accounts" subtitle="Choose which account each fee head is credited to." endpoint="/api/setup/bank-accounts" canWrite={can(user, "org.write")} fields={fields}
    columns={[{ label: "Label", render: (r: any) => <b>{r.label}</b> }, { label: "Bank", render: (r: any) => `${r.bankName}${r.branch ? ", " + r.branch : ""}` },
      { label: "Account", render: (r: any) => "••••" + String(r.accountNo).slice(-4) }, { label: "IFSC", render: (r: any) => r.ifsc }, { label: "", render: (r: any) => (r.isDefault ? <span className="pill brand">Default</span> : null) }, { label: "Status", render: active }]} />;
}

export function Staff() {
  const user = useUser();
  const fields: Field[] = [
    { name: "name", label: "Full name", required: true, span: 2 },
    { name: "email", label: "Email (sign-in)", type: "email", required: true }, { name: "phone", label: "Mobile" },
    { name: "role", label: "Role", type: "select", required: true, options: [{ value: "admin", label: "Admin — full access" }, { value: "accountant", label: "Accountant — setup, collection, approvals, reports" }, { value: "cashier", label: "Cashier — counter collection only" }] },
    { name: "password", label: "Password", type: "password", required: true, help: "At least 8 characters" },
  ];
  return <CrudPage title="Staff & roles" subtitle="Who can sign in, and what each role can do." endpoint="/api/staff" canWrite={can(user, "staff.manage")} fields={fields} defaults={{ role: "cashier" }} deleteLabel="Disable"
    columns={[{ label: "Name", render: (r: any) => <b>{r.name}</b> }, { label: "Email", render: (r: any) => r.email }, { label: "Mobile", render: (r: any) => r.phone || "—" },
      { label: "Role", render: (r: any) => <span className="pill brand cap">{r.role}</span> }, { label: "Last sign-in", render: (r: any) => fmtDate(r.lastLoginAt) }, { label: "Status", render: active }]} />;
}
