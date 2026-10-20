CREATE TABLE IF NOT EXISTS "notes" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "fileId" TEXT,
    "content" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "selectionText" TEXT,
    "selectionCoords" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notes_studentId_subjectId_idx" ON "notes"("studentId", "subjectId");
CREATE INDEX IF NOT EXISTS "notes_fileId_idx" ON "notes"("fileId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_studentId_fkey'
  ) THEN
    ALTER TABLE "notes"
      ADD CONSTRAINT "notes_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "students"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_subjectId_fkey'
  ) THEN
    ALTER TABLE "notes"
      ADD CONSTRAINT "notes_subjectId_fkey"
      FOREIGN KEY ("subjectId") REFERENCES "subjects"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_fileId_fkey'
  ) THEN
    ALTER TABLE "notes"
      ADD CONSTRAINT "notes_fileId_fkey"
      FOREIGN KEY ("fileId") REFERENCES "knowledge_files"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
