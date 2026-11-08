-- AlterTable
ALTER TABLE "Student" ADD COLUMN "aadhaarLast4" TEXT;
ALTER TABLE "Student" ADD COLUMN "apaarId" TEXT;
ALTER TABLE "Student" ADD COLUMN "bloodGroup" TEXT;
ALTER TABLE "Student" ADD COLUMN "leftOn" DATETIME;
ALTER TABLE "Student" ADD COLUMN "leftReason" TEXT;

-- CreateTable
CREATE TABLE "EnrollmentOptionalHead" (
    "enrollmentId" TEXT NOT NULL,
    "feeHeadId" TEXT NOT NULL,

    PRIMARY KEY ("enrollmentId", "feeHeadId"),
    CONSTRAINT "EnrollmentOptionalHead_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EnrollmentOptionalHead_feeHeadId_fkey" FOREIGN KEY ("feeHeadId") REFERENCES "FeeHead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Enrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sectionId" TEXT,
    "rollNo" TEXT,
    "usesTransport" BOOLEAN NOT NULL DEFAULT false,
    "transportRoute" TEXT,
    "usesHostel" BOOLEAN NOT NULL DEFAULT false,
    "feeCategory" TEXT,
    "feeStructureId" TEXT,
    CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Enrollment_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Enrollment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Enrollment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Enrollment_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Enrollment" ("academicYearId", "id", "rollNo", "sectionId", "studentId", "transportRoute", "unitId", "usesHostel", "usesTransport") SELECT "academicYearId", "id", "rollNo", "sectionId", "studentId", "transportRoute", "unitId", "usesHostel", "usesTransport" FROM "Enrollment";
DROP TABLE "Enrollment";
ALTER TABLE "new_Enrollment" RENAME TO "Enrollment";
CREATE UNIQUE INDEX "Enrollment_studentId_academicYearId_key" ON "Enrollment"("studentId", "academicYearId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
