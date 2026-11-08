import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requirePerm } from "../lib/rbac";
import { audit } from "../lib/audit";
import { fineFor, generateDues, reapplyConcessions, structureFor } from "../lib/dues";

export const students = Router();

const opt = z.string().trim().max(200).optional().nullable().transform(v => v || null);
const mobile = z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number");
const Guardian = z.object({ name: z.string().trim().min(1, "Guardian name is required"), relation: z.enum(["father", "mother", "guardian"]), phone: mobile, email: opt, occupation: opt });
const StudentBody = z.object({
  admissionNo: z.string().trim().min(1, "Admission number is required").max(30),
  firstName: z.string().trim().min(1, "First name is required"), lastName: opt,
  gender: z.enum(["male", "female", "other"]).optional().nullable(), dob: z.coerce.date().optional().nullable(),
  category: z.enum(["general", "obc", "sc", "st", "ews"]).optional().nullable(), isRte: z.boolean().optional(),
  phone: opt, email: opt, address: opt, bloodGroup: opt, apaarId: opt,
  aadhaarLast4: z.string().trim().regex(/^\d{4}$/, "Enter only the last 4 digits of Aadhaar").optional().nullable().or(z.literal("").transform(() => null)),
  admittedOn: z.coerce.date().optional().nullable(),
});
const EnrollBody = z.object({ academicYearId: z.string().min(1), unitId: z.string().min(1, "Choose a class"), sectionId: opt, rollNo: opt, feeCategory: opt });
const Create = z.object({ student: StudentBody, enrollment: EnrollBody, guardians: z.array(Guardian).min(1, "Add at least one parent/guardian") });

const name = (s: { firstName: string; lastName: string | null }) => [s.firstName, s.lastName].filter(Boolean).join(" ");
const currentYear = (institutionId: string) => prisma.academicYear.findFirst({ where: { institutionId, isCurrent: true } });

async function checkRefs(institutionId: string, e: z.infer<typeof EnrollBody>) {
  const [y, u, s] = await Promise.all([
    prisma.academicYear.findFirst({ where: { id: e.academicYearId, institutionId } }),
    prisma.unit.findFirst({ where: { id: e.unitId, institutionId } }),
    e.sectionId ? prisma.section.findFirst({ where: { id: e.sectionId, unitId: e.unitId } }) : Promise.resolve(true),
  ]);
  if (!y || !u) return "Year or class not found";
  if (!s) return "Section does not belong to this class";
  return null;
}

/** Reuse a guardian with the same phone (siblings share one parent record) */
async function upsertGuardians(tx: any, institutionId: string, studentId: string, gs: z.infer<typeof Guardian>[]) {
  for (const [i, g] of gs.entries()) {
    let row = await tx.guardian.findFirst({ where: { institutionId, phone: g.phone, relation: g.relation } });
    row = row ? await tx.guardian.update({ where: { id: row.id }, data: g }) : await tx.guardian.create({ data: { ...g, institutionId } });
    await tx.studentGuardian.upsert({ where: { studentId_guardianId: { studentId, guardianId: row.id } }, update: { isPrimary: i === 0 }, create: { studentId, guardianId: row.id, isPrimary: i === 0 } });
  }
}

// ── List ──
students.get("/", async (req, res) => {
  const institutionId = req.institutionId!;
  const year = req.query.academicYearId ? { id: String(req.query.academicYearId) } : await currentYear(institutionId);
  const q = String(req.query.q || "").trim();
  const list = await prisma.student.findMany({
    where: {
      institutionId, status: req.query.status ? String(req.query.status) : "active",
      ...(q ? { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { admissionNo: { contains: q } }, { phone: { contains: q } }, { guardians: { some: { guardian: { phone: { contains: q } } } } }] } : {}),
      ...(req.query.unitId || req.query.sectionId ? { enrollments: { some: { academicYearId: year?.id, ...(req.query.unitId ? { unitId: String(req.query.unitId) } : {}), ...(req.query.sectionId ? { sectionId: String(req.query.sectionId) } : {}) } } } : {}),
    },
    include: {
      feeDemands: { where: { status: { in: ["due", "partial"] } }, select: { netPaise: true, paidPaise: true, dueDate: true } },
      enrollments: { where: { academicYearId: year?.id }, include: { unit: { select: { name: true, sortOrder: true } }, section: { select: { name: true } } } },
      guardians: { where: { isPrimary: true }, include: { guardian: { select: { name: true, phone: true } } } },
    },
    orderBy: { admissionNo: "asc" },
    take: 1000,
  });
  const now = new Date();
  res.json(list.map(s => {
    const e = s.enrollments[0];
    return {
      id: s.id, admissionNo: s.admissionNo, name: name(s), status: s.status,
      className: e?.unit.name || null, section: e?.section?.name || null, rollNo: e?.rollNo || null, classOrder: e?.unit.sortOrder ?? 999,
      guardian: s.guardians[0]?.guardian.name || null, guardianPhone: s.guardians[0]?.guardian.phone || null,
      outstandingPaise: s.feeDemands.reduce((t, d) => t + d.netPaise - d.paidPaise, 0),
      overduePaise: s.feeDemands.filter(d => d.dueDate < now).reduce((t, d) => t + d.netPaise - d.paidPaise, 0),
    };
  }));
});

// ── Detail with ledger ──
students.get("/:id", async (req, res) => {
  const s = await prisma.student.findFirst({
    where: { id: String(req.params.id), institutionId: req.institutionId },
    include: {
      guardians: { include: { guardian: true }, orderBy: { isPrimary: "desc" } },
      enrollments: { include: { unit: true, section: true, academicYear: true, optionalHeads: { include: { feeHead: { select: { name: true } } } }, feeStructure: { select: { id: true, name: true } } }, orderBy: { academicYear: { startDate: "desc" } } },
      concessions: { include: { concession: { include: { feeHead: { select: { name: true } } } } } },
      feeDemands: { include: { feeHead: { select: { name: true, code: true } }, installment: { include: { feeStructure: { include: { lateFineRule: true } } } }, academicYear: { select: { name: true } } }, orderBy: [{ dueDate: "asc" }, { feeHead: { sortOrder: "asc" } }] },
      payments: { include: { receipt: true }, orderBy: { paidAt: "desc" } },
    },
  });
  if (!s) return res.status(404).json({ error: "Not found" });
  // siblings = other students sharing a guardian
  const gIds = s.guardians.map(g => g.guardianId);
  const sibs = await prisma.student.findMany({ where: { id: { not: s.id }, guardians: { some: { guardianId: { in: gIds } } } }, select: { id: true, admissionNo: true, firstName: true, lastName: true } });
  const now = new Date();
  const demands = s.feeDemands.map(d => ({ ...d, finePaise: fineFor(d, d.installment?.feeStructure.lateFineRule, now), balancePaise: d.netPaise - d.paidPaise, installment: undefined }));
  const current = s.enrollments[0];
  const resolved = current ? await structureFor(prisma as any, req.institutionId!, current) : null;
  res.json({ ...s, name: name(s), feeDemands: demands, siblings: sibs.map(x => ({ id: x.id, admissionNo: x.admissionNo, name: name(x) })), resolvedStructure: resolved ? { id: resolved.id, name: resolved.name, optionalHeads: resolved.items.filter(i => i.feeHead.isOptional).map(i => ({ id: i.feeHeadId, name: i.feeHead.name })) } : null });
});

// ── Create ──
students.post("/", requirePerm("students.write"), async (req, res) => {
  const p = Create.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const institutionId = req.institutionId!;
  const err = await checkRefs(institutionId, p.data.enrollment);
  if (err) return res.status(400).json({ error: err });
  if (await prisma.student.findFirst({ where: { institutionId, admissionNo: p.data.student.admissionNo } })) return res.status(409).json({ error: "This admission number already exists" });
  const s = await prisma.$transaction(async tx => {
    const st = await tx.student.create({ data: { ...p.data.student, institutionId, enrollments: { create: p.data.enrollment } } });
    await upsertGuardians(tx, institutionId, st.id, p.data.guardians);
    return st;
  });
  await audit(req, "create", "Student", s.id, undefined, p.data);
  res.status(201).json(s);
});

// ── Update profile / guardians / enrollment ──
students.put("/:id", requirePerm("students.write"), async (req, res) => {
  const before = await prisma.student.findFirst({ where: { id: String(req.params.id), institutionId: req.institutionId }, include: { enrollments: true } });
  if (!before) return res.status(404).json({ error: "Not found" });
  const p = z.object({ student: StudentBody.partial().extend({ status: z.enum(["active", "left", "passed_out", "transferred", "suspended"]).optional(), leftOn: z.coerce.date().optional().nullable(), leftReason: opt }), enrollment: EnrollBody.optional(), guardians: z.array(Guardian).optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  if (p.data.enrollment) { const err = await checkRefs(req.institutionId!, p.data.enrollment); if (err) return res.status(400).json({ error: err }); }
  if (p.data.student.admissionNo && p.data.student.admissionNo !== before.admissionNo && (await prisma.student.findFirst({ where: { institutionId: req.institutionId, admissionNo: p.data.student.admissionNo } }))) return res.status(409).json({ error: "This admission number already exists" });
  const s = await prisma.$transaction(async tx => {
    const st = await tx.student.update({ where: { id: before.id }, data: p.data.student });
    if (p.data.enrollment) {
      const { academicYearId, ...e } = p.data.enrollment;
      await tx.enrollment.upsert({ where: { studentId_academicYearId: { studentId: st.id, academicYearId } }, update: e, create: { ...e, academicYearId, studentId: st.id } });
    }
    if (p.data.guardians) {
      await tx.studentGuardian.deleteMany({ where: { studentId: st.id } });
      await upsertGuardians(tx, req.institutionId!, st.id, p.data.guardians);
    }
    // Leaving: cancel future unpaid dues
    if (p.data.student.status && p.data.student.status !== "active" && before.status === "active") {
      await tx.feeDemand.updateMany({ where: { studentId: st.id, paidPaise: 0, status: "due", dueDate: { gt: p.data.student.leftOn || new Date() } }, data: { status: "cancelled" } });
    }
    return st;
  });
  await audit(req, "update", "Student", s.id, before, p.data);
  res.json(s);
});

// ── Fee mapping: structure + optional heads ──
students.put("/:id/mapping", requirePerm("students.write"), async (req, res) => {
  const p = z.object({ academicYearId: z.string(), feeStructureId: opt, feeCategory: opt, optionalHeadIds: z.array(z.string()).default([]) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const e = await prisma.enrollment.findFirst({ where: { studentId: String(req.params.id), academicYearId: p.data.academicYearId, student: { institutionId: req.institutionId } }, include: { optionalHeads: true } });
  if (!e) return res.status(404).json({ error: "Student is not enrolled in this year" });
  if (p.data.feeStructureId && !(await prisma.feeStructure.findFirst({ where: { id: p.data.feeStructureId, institutionId: req.institutionId, academicYearId: p.data.academicYearId } }))) return res.status(400).json({ error: "Fee structure not found for this year" });
  await prisma.$transaction(async tx => {
    await tx.enrollment.update({ where: { id: e.id }, data: { feeStructureId: p.data.feeStructureId, feeCategory: p.data.feeCategory } });
    await tx.enrollmentOptionalHead.deleteMany({ where: { enrollmentId: e.id } });
    if (p.data.optionalHeadIds.length) await tx.enrollmentOptionalHead.createMany({ data: p.data.optionalHeadIds.map(feeHeadId => ({ enrollmentId: e.id, feeHeadId })) });
    // An optional head that was dropped: cancel its unpaid future dues
    const dropped = e.optionalHeads.map(o => o.feeHeadId).filter(h => !p.data.optionalHeadIds.includes(h));
    if (dropped.length) await tx.feeDemand.updateMany({ where: { studentId: e.studentId, academicYearId: e.academicYearId, feeHeadId: { in: dropped }, paidPaise: 0, status: "due", dueDate: { gt: new Date() } }, data: { status: "cancelled" } });
  });
  await audit(req, "update", "FeeMapping", e.id, e, p.data);
  res.json({ ok: true });
});

// ── Concessions on a student (approval permission) ──
students.post("/:id/concessions", requirePerm("approve"), async (req, res) => {
  const p = z.object({ concessionId: z.string(), remarks: z.string().trim().min(3, "Give a reason for the concession") }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const [s, c] = await Promise.all([prisma.student.findFirst({ where: { id: String(req.params.id), institutionId: req.institutionId } }), prisma.concession.findFirst({ where: { id: p.data.concessionId, institutionId: req.institutionId, isActive: true } })]);
  if (!s || !c) return res.status(404).json({ error: "Student or concession not found" });
  try {
    const row = await prisma.$transaction(async tx => {
      const r = await tx.studentConcession.create({ data: { institutionId: req.institutionId!, studentId: s.id, concessionId: c.id, remarks: p.data.remarks, approvedById: req.user!.sub } });
      await reapplyConcessions(tx, s.id);
      return r;
    });
    await audit(req, "approve_concession", "StudentConcession", row.id, undefined, row);
    res.status(201).json(row);
  } catch { res.status(409).json({ error: "This concession is already given to the student" }); }
});
students.delete("/:id/concessions/:scId", requirePerm("approve"), async (req, res) => {
  const sc = await prisma.studentConcession.findFirst({ where: { id: String(req.params.scId), studentId: String(req.params.id), institutionId: req.institutionId } });
  if (!sc) return res.status(404).json({ error: "Not found" });
  await prisma.$transaction(async tx => { await tx.studentConcession.delete({ where: { id: sc.id } }); await reapplyConcessions(tx, sc.studentId); });
  await audit(req, "remove_concession", "StudentConcession", sc.id, sc);
  res.json({ ok: true });
});

// ── Bulk import (rows parsed from CSV/Excel on the client) ──
const ImportRow = z.object({
  admissionNo: z.string().trim().min(1), firstName: z.string().trim().min(1), lastName: z.string().optional(), gender: z.string().optional(), dob: z.string().optional(),
  className: z.string().trim().min(1), section: z.string().optional(), rollNo: z.string().optional(), category: z.string().optional(),
  fatherName: z.string().optional(), motherName: z.string().optional(), guardianPhone: z.string().trim().regex(/^[6-9]\d{9}$/, "guardianPhone must be a 10-digit mobile"), email: z.string().optional(), address: z.string().optional(),
});
students.post("/import", requirePerm("students.write"), async (req, res) => {
  const institutionId = req.institutionId!;
  const p = z.object({ academicYearId: z.string(), rows: z.array(z.record(z.string(), z.any())).max(5000), dryRun: z.boolean().default(true) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const year = await prisma.academicYear.findFirst({ where: { id: p.data.academicYearId, institutionId } });
  if (!year) return res.status(400).json({ error: "Year not found" });
  const units = await prisma.unit.findMany({ where: { institutionId }, include: { sections: true } });
  const existing = new Set((await prisma.student.findMany({ where: { institutionId }, select: { admissionNo: true } })).map(s => s.admissionNo.toLowerCase()));
  const seen = new Set<string>();
  const errors: { row: number; error: string }[] = []; const ok: any[] = [];
  p.data.rows.forEach((raw, i) => {
    const clean = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v == null ? undefined : String(v).trim() || undefined]));
    const r = ImportRow.safeParse(clean);
    if (!r.success) return errors.push({ row: i + 2, error: r.error.issues[0].message.includes(String(r.error.issues[0].path[0])) ? r.error.issues[0].message : `${r.error.issues[0].path.join(".")}: ${r.error.issues[0].message}` });
    const d = r.data; const key = d.admissionNo.toLowerCase();
    if (existing.has(key) || seen.has(key)) return errors.push({ row: i + 2, error: `Admission no ${d.admissionNo} already exists` });
    const unit = units.find(u => u.name.toLowerCase() === d.className.toLowerCase());
    if (!unit) return errors.push({ row: i + 2, error: `Class "${d.className}" not found` });
    const sec = d.section ? unit.sections.find(s => s.name.toLowerCase() === d.section!.toLowerCase()) : null;
    if (d.section && !sec) return errors.push({ row: i + 2, error: `Section "${d.section}" not found in ${unit.name}` });
    const dob = d.dob ? parseDate(d.dob) : null;
    if (d.dob && !dob) return errors.push({ row: i + 2, error: `Date of birth "${d.dob}" — use DD-MM-YYYY` });
    seen.add(key); ok.push({ d, unit, sec, dob });
  });
  if (p.data.dryRun || errors.length) return res.json({ valid: ok.length, errors, imported: 0 });
  await prisma.$transaction(async tx => {
    for (const { d, unit, sec, dob } of ok) {
      const g = String(d.gender || "").toLowerCase();
      const cat = String(d.category || "").toLowerCase();
      const st = await tx.student.create({ data: { institutionId, admissionNo: d.admissionNo, firstName: d.firstName, lastName: d.lastName || null, dob, email: d.email || null, address: d.address || null,
        gender: ["male", "female", "other"].includes(g) ? g : g === "m" ? "male" : g === "f" ? "female" : null, category: ["general", "obc", "sc", "st", "ews"].includes(cat) ? cat : null,
        enrollments: { create: { academicYearId: year.id, unitId: unit.id, sectionId: sec?.id || null, rollNo: d.rollNo || null } } } });
      const gs = [d.fatherName && { name: d.fatherName, relation: "father", phone: d.guardianPhone }, d.motherName && { name: d.motherName, relation: "mother", phone: d.guardianPhone }].filter(Boolean) as any[];
      await upsertGuardians(tx, institutionId, st.id, gs.length ? gs : [{ name: `Parent of ${d.firstName}`, relation: "guardian", phone: d.guardianPhone }]);
    }
  }, { timeout: 120000 });
  await audit(req, "import", "Student", year.id, undefined, { count: ok.length });
  res.json({ valid: ok.length, errors: [], imported: ok.length });
});

function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  const d = m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s) : null;
  return d && !isNaN(d.getTime()) ? d : null;
}

// ── Dues generation ──
export const dues = Router();
dues.post("/generate", requirePerm("setup.write"), async (req, res) => {
  const p = z.object({ academicYearId: z.string(), unitId: z.string().optional(), studentIds: z.array(z.string()).optional(), fromDate: z.coerce.date().optional(), dryRun: z.boolean().default(true) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const y = await prisma.academicYear.findFirst({ where: { id: p.data.academicYearId, institutionId: req.institutionId } });
  if (!y) return res.status(404).json({ error: "Year not found" });
  if (y.isLocked && !p.data.dryRun) return res.status(400).json({ error: "This year is locked" });
  const r = await generateDues(req.institutionId!, y.id, p.data);
  if (!p.data.dryRun) await audit(req, "generate_dues", "AcademicYear", y.id, undefined, { ...p.data, ...r });
  res.json(r);
});
/** Mapping overview: per class, how many students, which structure, dues generated */
dues.get("/overview", requirePerm("setup.read"), async (req, res) => {
  const yearId = String(req.query.academicYearId || "");
  const units = await prisma.unit.findMany({ where: { institutionId: req.institutionId, isActive: true }, orderBy: { sortOrder: "asc" } });
  const out = [];
  for (const u of units) {
    const [students, structures, withDues] = await Promise.all([
      prisma.enrollment.count({ where: { unitId: u.id, academicYearId: yearId, student: { status: "active" } } }),
      prisma.feeStructure.findMany({ where: { unitId: u.id, academicYearId: yearId }, select: { id: true, name: true, category: true } }),
      prisma.enrollment.count({ where: { unitId: u.id, academicYearId: yearId, student: { status: "active", feeDemands: { some: { academicYearId: yearId } } } } }),
    ]);
    out.push({ unitId: u.id, unit: u.name, students, structures, withDues });
  }
  res.json(out);
});
