import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { can, requirePerm } from "../lib/rbac";
import { audit } from "../lib/audit";
import { fineFor } from "../lib/dues";
import { financialYear, inWords, istDayRange, istToday } from "../lib/money";

export const collect = Router();
const MODES = ["cash", "upi", "cheque", "dd", "card", "neft"] as const;
const name = (s: { firstName: string; lastName: string | null }) => [s.firstName, s.lastName].filter(Boolean).join(" ");

async function openDues(institutionId: string, studentId: string) {
  const ds = await prisma.feeDemand.findMany({
    where: { institutionId, studentId, status: { in: ["due", "partial"] } },
    include: { feeHead: { select: { name: true, code: true, sortOrder: true } }, academicYear: { select: { name: true } }, installment: { include: { feeStructure: { include: { lateFineRule: true } } } } },
    orderBy: [{ dueDate: "asc" }, { feeHead: { sortOrder: "asc" } }],
  });
  const now = new Date();
  return ds.map(d => ({
    id: d.id, periodLabel: d.periodLabel, year: d.academicYear.name, feeHead: d.feeHead.name, dueDate: d.dueDate,
    netPaise: d.netPaise, paidPaise: d.paidPaise, balancePaise: d.netPaise - d.paidPaise, finePaise: fineFor(d, d.installment?.feeStructure.lateFineRule, now), overdue: d.dueDate < now,
  }));
}

/** Student and open dues for the counter */
collect.get("/student/:id", requirePerm("collect"), async (req, res) => {
  const s = await prisma.student.findFirst({
    where: { id: String(req.params.id), institutionId: req.institutionId },
    include: { enrollments: { include: { unit: true, section: true }, orderBy: { academicYear: { startDate: "desc" } }, take: 1 }, guardians: { where: { isPrimary: true }, include: { guardian: true } },
      payments: { where: { status: "success" }, include: { receipt: true }, orderBy: { paidAt: "desc" }, take: 5 } },
  });
  if (!s) return res.status(404).json({ error: "Student not found" });
  const e = s.enrollments[0];
  res.json({
    id: s.id, admissionNo: s.admissionNo, name: name(s), status: s.status, className: e ? `${e.unit.name}${e.section ? "-" + e.section.name : ""}` : null, rollNo: e?.rollNo,
    guardian: s.guardians[0]?.guardian.name, guardianPhone: s.guardians[0]?.guardian.phone,
    dues: await openDues(req.institutionId!, s.id),
    recent: s.payments.map(p => ({ id: p.receipt?.id, receiptNo: p.receipt?.receiptNo, status: p.receipt?.status, amountPaise: p.amountPaise + p.finePaise, mode: p.mode, paidAt: p.paidAt })),
  });
});

const Body = z.object({
  studentId: z.string(), demandIds: z.array(z.string()).min(1, "Select at least one due"),
  amountPaise: z.number().int().positive("Enter the amount received"),
  fineWaivePaise: z.number().int().min(0).default(0), waiveReason: z.string().trim().optional(),
  mode: z.enum(MODES), referenceNo: z.string().trim().optional(), bankName: z.string().trim().optional(), chequeDate: z.coerce.date().optional(),
  remarks: z.string().trim().max(300).optional(), paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Counter collection. The amount pays the fine on the selected dues first, then the dues oldest first.
 * A partial amount is allowed. Receipt numbers are sequential per institution per FY, inside the same transaction.
 */
collect.post("/", requirePerm("collect"), async (req, res) => {
  const p = Body.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const b = p.data; const institutionId = req.institutionId!;
  if (["cheque", "dd"].includes(b.mode) && (!b.referenceNo || !b.bankName || !b.chequeDate)) return res.status(400).json({ error: `Enter the ${b.mode === "dd" ? "DD" : "cheque"} number, bank and date` });
  if (["upi", "card", "neft"].includes(b.mode) && !b.referenceNo) return res.status(400).json({ error: b.mode === "upi" ? "Enter the UPI transaction ID (UTR)" : "Enter the transaction reference" });
  if (b.fineWaivePaise > 0 && !can(req.user!.role, "approve")) return res.status(403).json({ error: "Only an accountant or admin can waive a late fine" });
  if (b.fineWaivePaise > 0 && (!b.waiveReason || b.waiveReason.length < 3)) return res.status(400).json({ error: "Give a reason for waiving the fine" });
  const paidAt = b.paidOn && b.paidOn !== istToday() ? new Date(`${b.paidOn}T12:00:00+05:30`) : new Date();
  if (paidAt.getTime() > Date.now() + 60000) return res.status(400).json({ error: "Payment date can't be in the future" });
  if (b.paidOn && b.paidOn !== istToday() && !can(req.user!.role, "approve")) return res.status(403).json({ error: "Only an accountant or admin can back-date a receipt" });

  try {
    const result = await prisma.$transaction(async tx => {
      const all = await openDues(institutionId, b.studentId);
      const sel = all.filter(d => b.demandIds.includes(d.id));
      if (sel.length !== new Set(b.demandIds).size) throw new Error("Some selected dues are already paid or not found. Refresh and try again.");
      const fineTotal = sel.reduce((t, d) => t + d.finePaise, 0);
      if (b.fineWaivePaise > fineTotal) throw new Error("Waiver is more than the fine");
      const fineDue = fineTotal - b.fineWaivePaise;
      const balance = sel.reduce((t, d) => t + d.balancePaise, 0);
      if (b.amountPaise > balance + fineDue) throw new Error(`Amount is more than the total due (₹${((balance + fineDue) / 100).toFixed(2)})`);
      if (b.amountPaise < fineDue) throw new Error("Amount must at least cover the late fine, or waive it");

      // fine settled (paid or waived) is recorded on each demand so it stops showing as due
      let finePay = fineDue, waive = b.fineWaivePaise;
      for (const d of sel) {
        if (!d.finePaise) continue;
        const w = Math.min(waive, d.finePaise); waive -= w;
        const f = Math.min(finePay, d.finePaise - w); finePay -= f;
        await tx.feeDemand.update({ where: { id: d.id }, data: { fineWaivedPaise: { increment: w + f } } });
      }
      let left = b.amountPaise - fineDue;
      const allocs: { feeDemandId: string; amountPaise: number }[] = [];
      for (const d of sel) {
        if (left <= 0) break;
        const a = Math.min(left, d.balancePaise); left -= a;
        allocs.push({ feeDemandId: d.id, amountPaise: a });
        await tx.feeDemand.update({ where: { id: d.id }, data: { paidPaise: { increment: a }, status: a === d.balancePaise ? "paid" : "partial" } });
      }
      const fy = financialYear(paidAt);
      const ctr = await tx.receiptCounter.upsert({ where: { institutionId_financialYear: { institutionId, financialYear: fy } }, update: { lastNo: { increment: 1 } }, create: { institutionId, financialYear: fy, lastNo: 1 } });
      const inst = await tx.institution.findUniqueOrThrow({ where: { id: institutionId } });
      const pay = await tx.payment.create({ data: {
        institutionId, studentId: b.studentId, amountPaise: b.amountPaise - fineDue, finePaise: fineDue, mode: b.mode, channel: "counter",
        referenceNo: b.referenceNo || null, bankName: b.bankName || null, chequeDate: b.chequeDate || null, chequeStatus: ["cheque", "dd"].includes(b.mode) ? "received" : null,
        collectedById: req.user!.sub, paidAt, remarks: [b.remarks, b.fineWaivePaise ? `Fine waived ₹${(b.fineWaivePaise / 100).toFixed(2)}: ${b.waiveReason}` : ""].filter(Boolean).join(" · ") || null,
        allocations: { create: allocs.map(a => ({ ...a, institutionId })) },
      } });
      const receipt = await tx.receipt.create({ data: { institutionId, paymentId: pay.id, financialYear: fy, issuedAt: paidAt, receiptNo: `${inst.receiptPrefix}/${fy}/${String(ctr.lastNo).padStart(6, "0")}` } });
      return { receipt, pay, waived: b.fineWaivePaise };
    });
    await audit(req, "collect", "Payment", result.pay.id, undefined, { receiptNo: result.receipt.receiptNo, amountPaise: b.amountPaise, mode: b.mode, fineWaivedPaise: result.waived });
    res.status(201).json({ id: result.receipt.id, receiptNo: result.receipt.receiptNo });
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

// ── Receipts ──
export const receipts = Router();

/** Day's collection (IST day) with totals by mode */
receipts.get("/", requirePerm("collect"), async (req, res) => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? String(req.query.date) : istToday();
  const { start, end } = istDayRange(day);
  const mine = req.query.mine === "1" || !can(req.user!.role, "reports");
  const list = await prisma.receipt.findMany({
    where: { institutionId: req.institutionId, issuedAt: { gte: start, lt: end }, ...(mine ? { payment: { collectedById: req.user!.sub } } : {}) },
    include: { payment: { include: { student: { select: { id: true, admissionNo: true, firstName: true, lastName: true } }, collectedBy: { select: { name: true } } } } },
    orderBy: { issuedAt: "desc" },
  });
  const rows = list.map(r => ({ id: r.id, receiptNo: r.receiptNo, status: r.status, issuedAt: r.issuedAt, student: name(r.payment.student), studentId: r.payment.student.id, admissionNo: r.payment.student.admissionNo,
    mode: r.payment.mode, referenceNo: r.payment.referenceNo, feePaise: r.payment.amountPaise, finePaise: r.payment.finePaise, totalPaise: r.payment.amountPaise + r.payment.finePaise, collectedBy: r.payment.collectedBy?.name, cancelReason: r.cancelReason }));
  const byMode: Record<string, number> = {};
  for (const r of rows) if (r.status === "valid") byMode[r.mode] = (byMode[r.mode] || 0) + r.totalPaise;
  res.json({ date: day, mine, rows, byMode, totalPaise: Object.values(byMode).reduce((a, b) => a + b, 0), count: rows.filter(r => r.status === "valid").length, cancelled: rows.filter(r => r.status === "cancelled").length });
});

/** Full receipt for printing */
receipts.get("/:id", requirePerm("collect"), async (req, res) => {
  const r = await prisma.receipt.findFirst({
    where: { id: String(req.params.id), institutionId: req.institutionId },
    include: { institution: true, payment: { include: { collectedBy: { select: { name: true } }, allocations: { include: { feeDemand: { include: { feeHead: true, academicYear: { select: { name: true } } } } } },
      student: { include: { enrollments: { include: { unit: true, section: true }, orderBy: { academicYear: { startDate: "desc" } }, take: 1 }, guardians: { where: { isPrimary: true }, include: { guardian: true } } } } } } },
  });
  if (!r) return res.status(404).json({ error: "Receipt not found" });
  const i = r.institution, p = r.payment, s = p.student, e = s.enrollments[0];
  const balance = await prisma.feeDemand.aggregate({ where: { studentId: s.id, status: { in: ["due", "partial"] } }, _sum: { netPaise: true, paidPaise: true } });
  const total = p.amountPaise + p.finePaise;
  res.json({
    id: r.id, receiptNo: r.receiptNo, financialYear: r.financialYear, issuedAt: r.issuedAt, status: r.status, cancelReason: r.cancelReason, cancelledAt: r.cancelledAt,
    institution: { name: i.name, address: [i.addressLine, i.city, i.district, i.state, i.pincode].filter(Boolean).join(", "), phone: i.phone, email: i.email, board: i.board, affiliationNo: i.affiliationNo, gstin: i.gstin, pan: i.pan, logoUrl: i.logoUrl, header: i.receiptHeader, footer: i.receiptFooter, trustName: i.trustName },
    student: { name: name(s), admissionNo: s.admissionNo, className: e ? `${e.unit.name}${e.section ? "-" + e.section.name : ""}` : null, rollNo: e?.rollNo, guardian: s.guardians[0]?.guardian.name },
    lines: p.allocations.map(a => ({ feeHead: a.feeDemand.feeHead.name, period: a.feeDemand.periodLabel, year: a.feeDemand.academicYear.name, sac: a.feeDemand.feeHead.hsnSac, amountPaise: a.amountPaise })),
    finePaise: p.finePaise, totalPaise: total, inWords: inWords(total),
    mode: p.mode, referenceNo: p.referenceNo, bankName: p.bankName, chequeDate: p.chequeDate, remarks: p.remarks, collectedBy: p.collectedBy?.name,
    balanceAfterPaise: (balance._sum.netPaise || 0) - (balance._sum.paidPaise || 0),
  });
});

/** Cancel a receipt: never deleted. Reverses the allocations so the dues are open again. */
receipts.post("/:id/cancel", requirePerm("approve"), async (req, res) => {
  const p = z.object({ reason: z.string().trim().min(5, "Give a clear reason (at least 5 characters)") }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const r = await prisma.receipt.findFirst({ where: { id: String(req.params.id), institutionId: req.institutionId }, include: { payment: { include: { allocations: true } } } });
  if (!r) return res.status(404).json({ error: "Receipt not found" });
  if (r.status === "cancelled") return res.status(400).json({ error: "Already cancelled" });
  await prisma.$transaction(async tx => {
    for (const a of r.payment.allocations) {
      const d = await tx.feeDemand.update({ where: { id: a.feeDemandId }, data: { paidPaise: { decrement: a.amountPaise } } });
      await tx.feeDemand.update({ where: { id: d.id }, data: { status: d.paidPaise <= 0 ? "due" : "partial" } });
    }
    // fine collected on this receipt becomes due again
    if (r.payment.finePaise) {
      let f = r.payment.finePaise;
      for (const a of r.payment.allocations) {
        if (f <= 0) break;
        const d = await tx.feeDemand.findUniqueOrThrow({ where: { id: a.feeDemandId } });
        const x = Math.min(f, d.fineWaivedPaise); f -= x;
        await tx.feeDemand.update({ where: { id: d.id }, data: { fineWaivedPaise: { decrement: x } } });
      }
    }
    await tx.payment.update({ where: { id: r.paymentId }, data: { status: "cancelled" } });
    await tx.receipt.update({ where: { id: r.id }, data: { status: "cancelled", cancelReason: p.data.reason, cancelledAt: new Date(), cancelledById: req.user!.sub } });
  });
  await audit(req, "cancel_receipt", "Receipt", r.id, { status: "valid" }, { status: "cancelled", reason: p.data.reason });
  res.json({ ok: true });
});
