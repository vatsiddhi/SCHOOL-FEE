import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requirePerm } from "../lib/rbac";
import { audit } from "../lib/audit";

export const structures = Router();
const FREQ = ["one_time", "monthly", "bi_monthly", "quarterly", "half_yearly", "term", "semester", "yearly", "per_installment"] as const;

const Body = z.object({
  name: z.string().trim().min(1, "Name is required"),
  academicYearId: z.string().min(1, "Choose an academic year"),
  unitId: z.string().min(1, "Choose a class"),
  category: z.string().trim().optional().nullable().transform(v => v || null),
  lateFineRuleId: z.string().optional().nullable().transform(v => v || null),
  items: z.array(z.object({ feeHeadId: z.string().min(1), amountPaise: z.coerce.number().int().min(0), frequency: z.enum(FREQ) })).min(1, "Add at least one fee head"),
  installments: z.array(z.object({ label: z.string().trim().min(1, "Instalment label is required"), dueDate: z.coerce.date() })).default([]),
});

const full = { items: { include: { feeHead: { select: { name: true, code: true, isOptional: true } } } }, installments: { orderBy: { sortOrder: "asc" as const } }, unit: { select: { name: true } }, academicYear: { select: { name: true } }, lateFineRule: { select: { name: true } } };

const total = (s: any) => s.items.reduce((t: number, i: any) => {
  const n = s.installments.length || 1;
  const times = i.frequency === "one_time" || i.frequency === "yearly" ? 1 : n;
  return t + i.amountPaise * times;
}, 0);

structures.get("/", requirePerm("setup.read"), async (req, res) => {
  const rows = await prisma.feeStructure.findMany({ where: { institutionId: req.institutionId, ...(req.query.academicYearId ? { academicYearId: String(req.query.academicYearId) } : {}) }, include: full, orderBy: [{ unit: { sortOrder: "asc" } }, { name: "asc" }] });
  res.json(rows.map(r => ({ ...r, yearlyTotalPaise: total(r) })));
});

structures.get("/:id", requirePerm("setup.read"), async (req, res) => {
  const r = await prisma.feeStructure.findFirst({ where: { id: String(req.params.id), institutionId: req.institutionId }, include: full });
  if (!r) return res.status(404).json({ error: "Not found" });
  res.json({ ...r, yearlyTotalPaise: total(r) });
});

async function validateRefs(institutionId: string, d: z.infer<typeof Body>) {
  const [y, u] = await Promise.all([prisma.academicYear.findFirst({ where: { id: d.academicYearId, institutionId } }), prisma.unit.findFirst({ where: { id: d.unitId, institutionId } })]);
  if (!y || !u) return "Year or class not found";
  if (y.isLocked) return "This academic year is locked";
  const heads = await prisma.feeHead.count({ where: { institutionId, id: { in: d.items.map(i => i.feeHeadId) } } });
  if (heads !== new Set(d.items.map(i => i.feeHeadId)).size) return "A fee head is missing or repeated";
  if (d.lateFineRuleId && !(await prisma.lateFineRule.findFirst({ where: { id: d.lateFineRuleId, institutionId } }))) return "Late fine rule not found";
  const needsInst = d.items.some(i => !["one_time", "yearly"].includes(i.frequency));
  if (needsInst && d.installments.length === 0) return "Add at least one instalment with a due date";
  return null;
}

structures.post("/", requirePerm("setup.write"), async (req, res) => {
  const p = Body.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const err = await validateRefs(req.institutionId!, p.data);
  if (err) return res.status(400).json({ error: err });
  const { items, installments, ...rest } = p.data;
  const row = await prisma.feeStructure.create({
    data: { ...rest, institutionId: req.institutionId!, items: { create: items }, installments: { create: installments.map((x, i) => ({ ...x, sortOrder: i })) } },
    include: full,
  });
  await audit(req, "create", "FeeStructure", row.id, undefined, row);
  res.status(201).json(row);
});

structures.put("/:id", requirePerm("setup.write"), async (req, res) => {
  const before = await prisma.feeStructure.findFirst({ where: { id: String(req.params.id), institutionId: req.institutionId }, include: full });
  if (!before) return res.status(404).json({ error: "Not found" });
  const p = Body.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const err = await validateRefs(req.institutionId!, p.data);
  if (err) return res.status(400).json({ error: err });
  const used = await prisma.feeDemand.count({ where: { installment: { feeStructureId: before.id } } });
  if (used) return res.status(409).json({ error: "Dues have already been generated from this structure. Copy it to make changes." });
  const { items, installments, ...rest } = p.data;
  const row = await prisma.$transaction(async tx => {
    await tx.feeStructureItem.deleteMany({ where: { feeStructureId: before.id } });
    await tx.feeInstallment.deleteMany({ where: { feeStructureId: before.id } });
    return tx.feeStructure.update({ where: { id: before.id }, data: { ...rest, items: { create: items }, installments: { create: installments.map((x, i) => ({ ...x, sortOrder: i })) } }, include: full });
  });
  await audit(req, "update", "FeeStructure", row.id, before, row);
  res.json(row);
});

/** Copy a structure to another class and/or year */
structures.post("/:id/copy", requirePerm("setup.write"), async (req, res) => {
  const src = await prisma.feeStructure.findFirst({ where: { id: String(req.params.id), institutionId: req.institutionId }, include: full });
  if (!src) return res.status(404).json({ error: "Not found" });
  const t = z.object({ unitId: z.string(), academicYearId: z.string(), name: z.string().trim().min(1) }).safeParse(req.body);
  if (!t.success) return res.status(400).json({ error: t.error.issues[0].message });
  const body = { ...t.data, category: src.category, lateFineRuleId: src.lateFineRuleId, items: src.items.map(i => ({ feeHeadId: i.feeHeadId, amountPaise: i.amountPaise, frequency: i.frequency as any })), installments: src.installments.map(i => ({ label: i.label, dueDate: i.dueDate })) };
  const err = await validateRefs(req.institutionId!, body);
  if (err) return res.status(400).json({ error: err });
  const row = await prisma.feeStructure.create({
    data: { institutionId: req.institutionId!, name: body.name, unitId: body.unitId, academicYearId: body.academicYearId, category: body.category, lateFineRuleId: body.lateFineRuleId, items: { create: body.items }, installments: { create: body.installments.map((x, i) => ({ ...x, sortOrder: i })) } },
  });
  await audit(req, "copy", "FeeStructure", row.id, { from: src.id }, row);
  res.status(201).json(row);
});

structures.delete("/:id", requirePerm("setup.write"), async (req, res) => {
  const s = await prisma.feeStructure.findFirst({ where: { id: String(req.params.id), institutionId: req.institutionId } });
  if (!s) return res.status(404).json({ error: "Not found" });
  if (await prisma.feeDemand.count({ where: { installment: { feeStructureId: s.id } } })) return res.status(409).json({ error: "Dues exist for this structure; it can't be deleted" });
  await prisma.$transaction([prisma.feeStructureItem.deleteMany({ where: { feeStructureId: s.id } }), prisma.feeInstallment.deleteMany({ where: { feeStructureId: s.id } }), prisma.feeStructure.delete({ where: { id: s.id } })]);
  await audit(req, "delete", "FeeStructure", s.id, s);
  res.json({ deleted: true });
});
