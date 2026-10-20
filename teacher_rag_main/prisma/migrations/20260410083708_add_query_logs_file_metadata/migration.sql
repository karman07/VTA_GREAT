-- AlterTable
ALTER TABLE "knowledge_files" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "query_logs" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "fileId" TEXT,
    "askedBy" TEXT NOT NULL DEFAULT 'teacher',
    "responseMs" INTEGER,
    "chunkCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "query_logs" ADD CONSTRAINT "query_logs_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_logs" ADD CONSTRAINT "query_logs_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "knowledge_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
