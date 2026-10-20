-- Add the missing FileSource enum value used by the current Prisma schema.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'FileSource'
          AND e.enumlabel = 's3'
    ) THEN
        ALTER TYPE "FileSource" ADD VALUE 's3';
    END IF;
END $$;

-- Create the tables that exist in the current Prisma schema but are missing
-- from the migration history that was previously committed.

CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "firebaseUid" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classCode" TEXT,
    "collectionName" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "totalTimeSpent" INTEGER NOT NULL DEFAULT 0,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT,
    "type" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- Add the subject relation to uploaded files.
ALTER TABLE "knowledge_files"
ADD COLUMN IF NOT EXISTS "subjectId" TEXT;

-- Extend query log metadata to match the current schema.
ALTER TABLE "query_logs"
ADD COLUMN IF NOT EXISTS "subjectId" TEXT,
ADD COLUMN IF NOT EXISTS "studentId" TEXT,
ADD COLUMN IF NOT EXISTS "topic" TEXT;

-- Existing uniqueness rules from the Prisma schema.
CREATE UNIQUE INDEX "students_email_key" ON "students"("email");
CREATE UNIQUE INDEX "students_firebaseUid_key" ON "students"("firebaseUid");
CREATE UNIQUE INDEX "subjects_classCode_key" ON "subjects"("classCode");
CREATE UNIQUE INDEX "subjects_collectionName_key" ON "subjects"("collectionName");
CREATE UNIQUE INDEX "enrollments_studentId_subjectId_key" ON "enrollments"("studentId", "subjectId");

-- Match @@unique([teacherId, name]) and the mapped table names from the schema.
CREATE UNIQUE INDEX "subjects_teacherId_name_key" ON "subjects"("teacherId", "name");

-- Foreign keys.
ALTER TABLE "subjects"
ADD CONSTRAINT "subjects_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "knowledge_files"
ADD CONSTRAINT "knowledge_files_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "enrollments"
ADD CONSTRAINT "enrollments_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "enrollments"
ADD CONSTRAINT "enrollments_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "activity_logs"
ADD CONSTRAINT "activity_logs_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "activity_logs"
ADD CONSTRAINT "activity_logs_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "query_logs"
ADD CONSTRAINT "query_logs_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "query_logs"
ADD CONSTRAINT "query_logs_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;