import { Router } from "express";
import { prisma } from "../lib/prisma";

export const students = Router();

// List students with outstanding balance (scoped to institution)
students.get("/", async (req, res) => {
  const institutionId = req.institutionId!;
  const list = await prisma.student.findMany({
    where: { institutionId, status: "active" },
    include: { feeDemands: { where: { status: { in: ["due", "partial"] } } } },
    orderBy: { admissionNo: "asc" },
  });
  res.json(list.map(s => ({
    id: s.id, admissionNo: s.admissionNo, name: [s.firstName, s.lastName].filter(Boolean).join(" "),
    outstandingPaise: s.feeDemands.reduce((t, d) => t + d.netPaise - d.paidPaise, 0),
  })));
});
