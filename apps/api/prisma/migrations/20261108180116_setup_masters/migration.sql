-- AlterTable
ALTER TABLE "Institution" ADD COLUMN "affiliationNo" TEXT;
ALTER TABLE "Institution" ADD COLUMN "aisheCode" TEXT;
ALTER TABLE "Institution" ADD COLUMN "district" TEXT;
ALTER TABLE "Institution" ADD COLUMN "receiptFooter" TEXT;
ALTER TABLE "Institution" ADD COLUMN "receiptHeader" TEXT;
ALTER TABLE "Institution" ADD COLUMN "registrationNo" TEXT;
ALTER TABLE "Institution" ADD COLUMN "shortName" TEXT;
ALTER TABLE "Institution" ADD COLUMN "themeColor" TEXT DEFAULT '#4338ca';
ALTER TABLE "Institution" ADD COLUMN "trustName" TEXT;
ALTER TABLE "Institution" ADD COLUMN "udiseCode" TEXT;
ALTER TABLE "Institution" ADD COLUMN "website" TEXT;

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN "nextUnitId" TEXT;
ALTER TABLE "Unit" ADD COLUMN "stream" TEXT;

-- CreateTable
CREATE TABLE "FeeType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "FeeType_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNo" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "branch" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "BankAccount_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AcademicYear" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "AcademicYear_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AcademicYear" ("endDate", "id", "institutionId", "isCurrent", "name", "startDate") SELECT "endDate", "id", "institutionId", "isCurrent", "name", "startDate" FROM "AcademicYear";
DROP TABLE "AcademicYear";
ALTER TABLE "new_AcademicYear" RENAME TO "AcademicYear";
CREATE UNIQUE INDEX "AcademicYear_institutionId_name_key" ON "AcademicYear"("institutionId", "name");
CREATE TABLE "new_FeeHead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "feeTypeId" TEXT,
    "bankAccountId" TEXT,
    "concessionAllowed" BOOLEAN NOT NULL DEFAULT true,
    "fineApplicable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRefundable" BOOLEAN NOT NULL DEFAULT false,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "gstApplicable" BOOLEAN NOT NULL DEFAULT false,
    "gstRateBps" INTEGER NOT NULL DEFAULT 0,
    "hsnSac" TEXT,
    "isTuition" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "FeeHead_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FeeHead_feeTypeId_fkey" FOREIGN KEY ("feeTypeId") REFERENCES "FeeType" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FeeHead_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FeeHead" ("code", "gstApplicable", "gstRateBps", "hsnSac", "id", "institutionId", "isActive", "isOptional", "isRefundable", "isTuition", "name") SELECT "code", "gstApplicable", "gstRateBps", "hsnSac", "id", "institutionId", "isActive", "isOptional", "isRefundable", "isTuition", "name" FROM "FeeHead";
DROP TABLE "FeeHead";
ALTER TABLE "new_FeeHead" RENAME TO "FeeHead";
CREATE UNIQUE INDEX "FeeHead_institutionId_code_key" ON "FeeHead"("institutionId", "code");
CREATE TABLE "new_FeeStructure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lateFineRuleId" TEXT,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    CONSTRAINT "FeeStructure_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FeeStructure_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FeeStructure_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FeeStructure_lateFineRuleId_fkey" FOREIGN KEY ("lateFineRuleId") REFERENCES "LateFineRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FeeStructure" ("academicYearId", "id", "institutionId", "lateFineRuleId", "name", "unitId") SELECT "academicYearId", "id", "institutionId", "lateFineRuleId", "name", "unitId" FROM "FeeStructure";
DROP TABLE "FeeStructure";
ALTER TABLE "new_FeeStructure" RENAME TO "FeeStructure";
CREATE UNIQUE INDEX "FeeStructure_academicYearId_unitId_name_key" ON "FeeStructure"("academicYearId", "unitId", "name");
CREATE TABLE "new_Section" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "classTeacher" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Section_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Section_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Section" ("id", "institutionId", "name", "unitId") SELECT "id", "institutionId", "name", "unitId" FROM "Section";
DROP TABLE "Section";
ALTER TABLE "new_Section" RENAME TO "Section";
CREATE UNIQUE INDEX "Section_unitId_name_key" ON "Section"("unitId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "FeeType_institutionId_code_key" ON "FeeType"("institutionId", "code");
