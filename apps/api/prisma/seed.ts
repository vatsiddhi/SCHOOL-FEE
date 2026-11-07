import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const rupees = (r: number) => Math.round(r * 100); // to paise

async function main() {
  if ((await prisma.institution.count({ where: { code: "demo-school" } })) > 0) {
    console.log("Demo data already present, skipping seed");
    return;
  }
  const plan = await prisma.plan.upsert({
    where: { name: "Starter" },
    update: {},
    create: { name: "Starter", maxStudents: 500, pricePaise: rupees(12000) },
  });

  await prisma.platformUser.upsert({
    where: { email: "admin@feedesk.local" },
    update: {},
    create: { name: "Platform Admin", email: "admin@feedesk.local", passwordHash: await bcrypt.hash("admin123", 10), role: "super_admin" },
  });

  const inst = await prisma.institution.upsert({
    where: { code: "demo-school" },
    update: {},
    create: { code: "demo-school", name: "Demo Public School", type: "school", board: "CBSE", city: "Bhubaneswar", state: "Odisha", pincode: "751001", status: "trial", planId: plan.id, receiptPrefix: "DPS" },
  });
  const institutionId = inst.id;

  await prisma.user.upsert({
    where: { institutionId_email: { institutionId, email: "accounts@demo.school" } },
    update: {},
    create: { institutionId, name: "School Accountant", email: "accounts@demo.school", passwordHash: await bcrypt.hash("demo123", 10), role: "admin" },
  });

  const year = await prisma.academicYear.upsert({
    where: { institutionId_name: { institutionId, name: "2026-27" } },
    update: {},
    create: { institutionId, name: "2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), isCurrent: true },
  });

  const heads = [
    { code: "TUI", name: "Tuition Fee", isTuition: true },
    { code: "ADM", name: "Admission Fee" },
    { code: "TRN", name: "Transport Fee", isOptional: true },
  ];
  const headMap: Record<string, string> = {};
  for (const h of heads) {
    const fh = await prisma.feeHead.upsert({
      where: { institutionId_code: { institutionId, code: h.code } },
      update: {},
      create: { institutionId, ...h },
    });
    headMap[h.code] = fh.id;
  }

  const fine = await prisma.lateFineRule.create({
    data: { institutionId, name: "₹10/day after 10 days", type: "per_day", graceDays: 10, amountPaise: rupees(10), maxPaise: rupees(500) },
  });

  for (const [i, cls] of ["Class 5", "Class 6"].entries()) {
    const unit = await prisma.unit.upsert({
      where: { institutionId_name: { institutionId, name: cls } },
      update: {},
      create: { institutionId, name: cls, kind: "class", sortOrder: i },
    });
    const section = await prisma.section.upsert({
      where: { unitId_name: { unitId: unit.id, name: "A" } },
      update: {},
      create: { institutionId, unitId: unit.id, name: "A" },
    });

    const structure = await prisma.feeStructure.create({
      data: {
        institutionId, academicYearId: year.id, unitId: unit.id, name: `${cls} Fees 2026-27`, lateFineRuleId: fine.id,
        items: { create: [
          { feeHeadId: headMap.TUI, amountPaise: rupees(2500 + i * 300), frequency: "quarterly" },
        ] },
        installments: { create: [
          { label: "Q1 (Apr-Jun)", dueDate: new Date("2026-04-10"), sortOrder: 1 },
          { label: "Q2 (Jul-Sep)", dueDate: new Date("2026-07-10"), sortOrder: 2 },
          { label: "Q3 (Oct-Dec)", dueDate: new Date("2026-10-10"), sortOrder: 3 },
          { label: "Q4 (Jan-Mar)", dueDate: new Date("2027-01-10"), sortOrder: 4 },
        ] },
      },
      include: { items: true, installments: true },
    });

    for (let s = 1; s <= 3; s++) {
      const student = await prisma.student.create({
        data: {
          institutionId, admissionNo: `DPS${i + 5}0${s}`, firstName: ["Aarav", "Ananya", "Rohan"][s - 1], lastName: ["Mohanty", "Das", "Patnaik"][s - 1],
          category: "general", status: "active",
          enrollments: { create: { academicYearId: year.id, unitId: unit.id, sectionId: section.id, rollNo: String(s) } },
        },
      });
      const g = await prisma.guardian.create({ data: { institutionId, name: `Parent of ${student.firstName}`, relation: "father", phone: `98610000${i}${s}` } });
      await prisma.studentGuardian.create({ data: { studentId: student.id, guardianId: g.id, isPrimary: true } });

      // generate demands
      for (const item of structure.items) {
        for (const inst of structure.installments) {
          await prisma.feeDemand.create({
            data: {
              institutionId, studentId: student.id, academicYearId: year.id, feeHeadId: item.feeHeadId, installmentId: inst.id,
              periodLabel: inst.label, dueDate: inst.dueDate, grossPaise: item.amountPaise, netPaise: item.amountPaise,
            },
          });
        }
      }
    }
  }
  console.log("Seeded demo institution:", inst.code);
}

main().finally(() => prisma.$disconnect());
