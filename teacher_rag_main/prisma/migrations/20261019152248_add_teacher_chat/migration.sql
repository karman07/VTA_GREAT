-- CreateTable
CREATE TABLE "teacher_chat_sessions" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_chat_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teacher_chat_sessions_teacherId_subjectId_idx" ON "teacher_chat_sessions"("teacherId", "subjectId");

-- CreateIndex
CREATE INDEX "teacher_chat_messages_sessionId_idx" ON "teacher_chat_messages"("sessionId");

-- AddForeignKey
ALTER TABLE "teacher_chat_sessions" ADD CONSTRAINT "teacher_chat_sessions_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_chat_sessions" ADD CONSTRAINT "teacher_chat_sessions_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_chat_messages" ADD CONSTRAINT "teacher_chat_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "teacher_chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
