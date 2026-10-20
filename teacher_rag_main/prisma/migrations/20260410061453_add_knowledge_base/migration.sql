-- CreateEnum
CREATE TYPE "FileSource" AS ENUM ('upload', 'google_drive', 'dropbox', 'notion', 'onedrive');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('uploading', 'processing', 'ready', 'error');

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "collectionName" TEXT NOT NULL,
    "totalFiles" INTEGER NOT NULL DEFAULT 0,
    "totalSizeBytes" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_files" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "storagePath" TEXT NOT NULL,
    "source" "FileSource" NOT NULL DEFAULT 'upload',
    "status" "FileStatus" NOT NULL DEFAULT 'uploading',
    "cloudFileId" TEXT,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_bases_teacherId_key" ON "knowledge_bases"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_bases_collectionName_key" ON "knowledge_bases"("collectionName");

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_files" ADD CONSTRAINT "knowledge_files_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
