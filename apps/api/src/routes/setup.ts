import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { crud, P, optStr } from "../lib/crud";
import { requirePerm } from "../lib/rbac";
import { audit } from "../lib/audit";

export const setup = Router();
const name = z.string().trim().min(1, "Name is required").max(120);
const date = z.coerce.date();

// ── Organisation ──
const Org = z.object({
  name, shortName: optStr, type: z.enum(["school", "college", "coaching", "university", "training", "other"]), board: optStr,
  affiliationNo: optStr, udiseCode: optStr, aisheCode: optStr, email: optStr, phone: optStr, website: optStr,
  addressLine: optStr, city: optStr, district: optStr, state: optStr,
  pincode: z.string().trim().regex(/^\d{6}$/, "PIN code must be 6 digits").optional().nullable().or(z.literal("").transform(() => null)),
  gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "GSTIN format is invalid").optional().nullable().or(z.literal("").transform(() => null)),
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "PAN format is invalid").optional().nullable().or(z.literal("").transform(() => null)),
  trustName: optStr, registrationNo: optStr, receiptPrefix: z.string().trim().min(1).max(10).regex(/^[A-Za-z0-9-]+$/, "Prefix: letters, digits, hyphen"),
  receiptHeader: optStr, receiptFooter: optStr, logoUrl: optStr, themeColor: optStr,
  convenienceFeeEnabled: z.boolean().optional(), convenienceFeeBps: z.coerce.number().int().min(0).max(500).optional(),
});
setup.get("/organisation", requirePerm("setup.read"), async (req, res) => {
  const i = await prisma.institution.findUnique({ where: { id: req.institutionId } });
  res.json(i);
});
setup.put("/organisation", requirePerm("org.write"), async (req, res) => {
  const p = Org.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const before = await prisma.institution.findUnique({ where: { id: req.institutionId } });
  const row = await prisma.institution.update({ where: { id: req.institutionId }, data: p.data });
  await audit(req, "update", "Institution", row.id, before, row);
  res.json(row);
});

// ── Academic years ──
const unsetOtherCurrent = async (req: any, data: any, id?: string) => {
  if (data.isCurrent) await prisma.academicYear.updateMany({ where: { institutionId: req.institutionId, NOT: id ? { id } : undefined }, data: { isCurrent: false } });
  if (data.startDate && data.endDate && data.endDate <= data.startDate) throw Object.assign(new Error("End date must be after start date"), { status: 400 });
  return data;
};
setup.use("/academic-years", crud({
  model: "academicYear", entity: "AcademicYear", orderBy: { startDate: "desc" },
  schema: z.object({ name: z.string().trim().regex(/^\d{4}-\d{2}$/, "Use the format 2026-27"), startDate: date, endDate: date, isCurrent: z.boolean().optional(), isLocked: z.boolean().optional() }),
  beforeWrite: unsetOtherCurrent,
  canDelete: async id => ((await prisma.feeDemand.count({ where: { academicYearId: id } })) ? "This year already has fee dues" : null),
}));

// ── Classes / courses / batches ──
setup.use("/units", crud({
  model: "unit", entity: "Unit", orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { sections: true } } },
  schema: z.object({ name, kind: z.enum(["class", "course", "semester", "batch"]), stream: optStr, sortOrder: z.coerce.number().int().optional(), nextUnitId: optStr, isActive: z.boolean().optional() }),
}));

// ── Sections ──
setup.use("/sections", crud({
  model: "section", entity: "Section", orderBy: [{ unit: { sortOrder: "asc" } }, { name: "asc" }], include: { unit: { select: { name: true } } },
  where: req => (req.query.unitId ? { unitId: String(req.query.unitId) } : {}),
  schema: z.object({ unitId: z.string().min(1, "Choose a class"), name: z.string().trim().min(1, "Section name is required").max(20), capacity: z.coerce.number().int().min(1).optional().nullable(), classTeacher: optStr, isActive: z.boolean().optional() }),
  beforeWrite: async (req, d) => {
    if (d.unitId && !(await prisma.unit.findFirst({ where: { id: d.unitId, institutionId: req.institutionId } }))) throw Object.assign(new Error("Class not found"), { status: 400 });
    return d;
  },
}));

// ── Fee types ──
setup.use("/fee-types", crud({
  model: "feeType", entity: "FeeType", orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { feeHeads: true } } },
  schema: z.object({ name, code: z.string().trim().toUpperCase().min(1).max(10), sortOrder: z.coerce.number().int().optional(), isActive: z.boolean().optional() }),
}));

// ── Bank accounts ──
setup.use("/bank-accounts", crud({
  model: "bankAccount", entity: "BankAccount", writePerm: "org.write", orderBy: { label: "asc" },
  schema: z.object({ label: name, bankName: name, accountNo: z.string().trim().regex(/^\d{6,18}$/, "Account number must be 6–18 digits"),
    ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC format is invalid"), branch: optStr, isDefault: z.boolean().optional(), isActive: z.boolean().optional() }),
  beforeWrite: async (req, d, id) => {
    if (d.isDefault) await prisma.bankAccount.updateMany({ where: { institutionId: req.institutionId, NOT: id ? { id } : undefined }, data: { isDefault: false } });
    return d;
  },
}));

// ── Fee heads ──
const checkRef = async (model: string, id: string | null | undefined, institutionId: string, label: string) => {
  if (id && !(await (prisma as any)[model].findFirst({ where: { id, institutionId } }))) throw Object.assign(new Error(`${label} not found`), { status: 400 });
};
setup.use("/fee-heads", crud({
  model: "feeHead", entity: "FeeHead", orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { feeType: { select: { name: true } }, bankAccount: { select: { label: true } } },
  schema: z.object({
    name, code: z.string().trim().toUpperCase().min(1).max(10), feeTypeId: optStr, bankAccountId: optStr,
    isRefundable: z.boolean().optional(), isOptional: z.boolean().optional(), gstApplicable: z.boolean().optional(),
    gstRateBps: z.coerce.number().int().min(0).max(2800).optional(), hsnSac: optStr, isTuition: z.boolean().optional(),
    concessionAllowed: z.boolean().optional(), fineApplicable: z.boolean().optional(), sortOrder: z.coerce.number().int().optional(), isActive: z.boolean().optional(),
  }),
  beforeWrite: async (req, d) => {
    await checkRef("feeType", d.feeTypeId, req.institutionId!, "Fee type");
    await checkRef("bankAccount", d.bankAccountId, req.institutionId!, "Bank account");
    if (d.gstApplicable === false) d.gstRateBps = 0;
    return d;
  },
}));

// ── Concessions ──
setup.use("/concessions", crud({
  model: "concession", entity: "Concession", orderBy: { name: "asc" }, include: { feeHead: { select: { name: true } }, _count: { select: { students: true } } },
  schema: z.object({ name, type: z.enum(["percent", "flat"]), valueBps: z.coerce.number().int().min(0).max(10000).optional().nullable(), valuePaise: P.optional().nullable(), feeHeadId: optStr, isActive: z.boolean().optional() }),
  beforeWrite: async (req, d) => {
    await checkRef("feeHead", d.feeHeadId, req.institutionId!, "Fee head");
    if (d.type === "percent") { if (!d.valueBps) throw Object.assign(new Error("Enter the percentage"), { status: 400 }); d.valuePaise = null; }
    if (d.type === "flat") { if (!d.valuePaise) throw Object.assign(new Error("Enter the amount"), { status: 400 }); d.valueBps = null; }
    return d;
  },
}));

// ── Late fine rules ──
setup.use("/late-fine-rules", crud({
  model: "lateFineRule", entity: "LateFineRule", orderBy: { name: "asc" },
  schema: z.object({ name, type: z.enum(["per_day", "flat", "slab"]), graceDays: z.coerce.number().int().min(0).max(365).optional(), amountPaise: P.optional(), maxPaise: P.optional().nullable(), slabsJson: optStr }),
  canDelete: async id => ((await prisma.feeStructure.count({ where: { lateFineRuleId: id } })) ? "This rule is used by a fee structure" : null),
}));

// ── Setup progress (wizard checklist) ──
setup.get("/progress", requirePerm("setup.read"), async (req, res) => {
  const w = { institutionId: req.institutionId };
  const inst = await prisma.institution.findUnique({ where: { id: req.institutionId } });
  const [years, units, sections, types, heads, structures, banks, staff, students] = await Promise.all([
    prisma.academicYear.count({ where: w }), prisma.unit.count({ where: { ...w, isActive: true } }), prisma.section.count({ where: w }),
    prisma.feeType.count({ where: w }), prisma.feeHead.count({ where: { ...w, isActive: true } }), prisma.feeStructure.count({ where: w }),
    prisma.bankAccount.count({ where: w }), prisma.user.count({ where: w }), prisma.student.count({ where: w }),
  ]);
  res.json({
    organisation: !!(inst?.name && inst.addressLine && inst.phone), years, units, sections, types, heads, structures, banks, staff, students,
  });
});
