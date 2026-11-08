import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Tx = Prisma.TransactionClient;
const ONCE = ["one_time", "yearly"];

/** Pick the fee structure for an enrollment: explicit mapping, else class + category, else class with no category */
export async function structureFor(tx: Tx, institutionId: string, e: { feeStructureId: string | null; unitId: string; academicYearId: string; feeCategory: string | null }) {
  const inc = { items: { include: { feeHead: true } }, installments: { orderBy: { sortOrder: "asc" as const } } };
  if (e.feeStructureId) return tx.feeStructure.findFirst({ where: { id: e.feeStructureId, institutionId }, include: inc });
  const base = { institutionId, unitId: e.unitId, academicYearId: e.academicYearId };
  return (e.feeCategory && (await tx.feeStructure.findFirst({ where: { ...base, category: e.feeCategory }, include: inc })))
    || tx.feeStructure.findFirst({ where: { ...base, category: null }, include: inc });
}

/** Concession amount for one demand line, from the student's active concessions */
export function concessionFor(gross: number, head: { id: string; concessionAllowed: boolean }, scs: { concession: { type: string; valueBps: number | null; valuePaise: number | null; feeHeadId: string | null; isActive: boolean } }[]) {
  if (!head.concessionAllowed) return 0;
  let c = 0;
  for (const { concession: k } of scs) {
    if (!k.isActive || (k.feeHeadId && k.feeHeadId !== head.id)) continue;
    c += k.type === "percent" ? Math.round((gross * (k.valueBps || 0)) / 10000) : k.valuePaise || 0;
  }
  return Math.min(c, gross);
}

export type GenResult = { students: number; created: number; skipped: number; totalPaise: number; noStructure: string[] };

/**
 * Create fee demands (dues) for enrollments of a year. Idempotent: an existing demand for
 * the same student + head + instalment is never duplicated or changed.
 * fromDate: skip instalments due before this date (mid-year admissions).
 */
export async function generateDues(institutionId: string, academicYearId: string, opts: { unitId?: string; studentIds?: string[]; fromDate?: Date; dryRun?: boolean }): Promise<GenResult> {
  const res: GenResult = { students: 0, created: 0, skipped: 0, totalPaise: 0, noStructure: [] };
  const run = async (tx: Tx) => {
    const ens = await tx.enrollment.findMany({
      where: { academicYearId, academicYear: { institutionId }, ...(opts.unitId ? { unitId: opts.unitId } : {}), ...(opts.studentIds ? { studentId: { in: opts.studentIds } } : {}), student: { status: "active" } },
      include: { student: { include: { concessions: { include: { concession: true } } } }, optionalHeads: true },
    });
    for (const e of ens) {
      const st = await structureFor(tx, institutionId, e);
      if (!st) { res.noStructure.push(e.student.admissionNo); continue; }
      res.students++;
      const opted = new Set(e.optionalHeads.map(o => o.feeHeadId));
      const existing = new Set((await tx.feeDemand.findMany({ where: { studentId: e.studentId, academicYearId }, select: { feeHeadId: true, installmentId: true } })).map(d => `${d.feeHeadId}|${d.installmentId}`));
      for (const item of st.items) {
        if (!item.feeHead.isActive || (item.feeHead.isOptional && !opted.has(item.feeHeadId))) continue;
        const insts = ONCE.includes(item.frequency) ? st.installments.slice(0, 1) : st.installments;
        for (const inst of insts) {
          if (opts.fromDate && !ONCE.includes(item.frequency) && inst.dueDate < opts.fromDate) continue;
          if (existing.has(`${item.feeHeadId}|${inst.id}`)) { res.skipped++; continue; }
          const gross = item.amountPaise;
          const conc = concessionFor(gross, item.feeHead, e.student.concessions);
          const gst = item.feeHead.gstApplicable ? Math.round(((gross - conc) * item.feeHead.gstRateBps) / 10000) : 0;
          const net = gross - conc + gst;
          res.created++; res.totalPaise += net;
          if (!opts.dryRun) await tx.feeDemand.create({ data: { institutionId, studentId: e.studentId, academicYearId, feeHeadId: item.feeHeadId, installmentId: inst.id, periodLabel: inst.label, dueDate: inst.dueDate, grossPaise: gross, concessionPaise: conc, gstPaise: gst, netPaise: net } });
        }
      }
    }
  };
  await prisma.$transaction(run, { timeout: 60000 });
  return res;
}

/** Re-apply concessions to a student's dues that have no payment yet (after a concession is added/removed) */
export async function reapplyConcessions(tx: Tx, studentId: string) {
  const st = await tx.student.findUniqueOrThrow({ where: { id: studentId }, include: { concessions: { include: { concession: true } } } });
  const dues = await tx.feeDemand.findMany({ where: { studentId, paidPaise: 0, status: "due" }, include: { feeHead: true } });
  for (const d of dues) {
    const conc = concessionFor(d.grossPaise, d.feeHead, st.concessions);
    const gst = d.feeHead.gstApplicable ? Math.round(((d.grossPaise - conc) * d.feeHead.gstRateBps) / 10000) : 0;
    if (conc !== d.concessionPaise || gst !== d.gstPaise) await tx.feeDemand.update({ where: { id: d.id }, data: { concessionPaise: conc, gstPaise: gst, netPaise: d.grossPaise - conc + gst } });
  }
}

/** Late fine on a demand as of a date (fine rule from its structure) */
export function fineFor(d: { dueDate: Date; netPaise: number; paidPaise: number; fineWaivedPaise: number }, rule: { type: string; graceDays: number; amountPaise: number; maxPaise: number | null } | null | undefined, on = new Date()) {
  if (!rule || d.paidPaise >= d.netPaise) return 0;
  const days = Math.floor((on.getTime() - d.dueDate.getTime()) / 86400000) - rule.graceDays;
  if (days <= 0) return 0;
  let f = rule.type === "per_day" ? days * rule.amountPaise : rule.amountPaise;
  if (rule.maxPaise) f = Math.min(f, rule.maxPaise);
  return Math.max(0, f - d.fineWaivedPaise);
}
