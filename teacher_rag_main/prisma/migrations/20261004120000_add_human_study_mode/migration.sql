-- CreateTable
CREATE TABLE "study_configs" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "consentText" TEXT,
    "consentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_reviewers" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_reviewers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_consents" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "consentVersion" INTEGER NOT NULL,
    "agreed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_ratings" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "helpful" INTEGER NOT NULL,
    "citationSupport" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answer_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_responses" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expert_reviews" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "relevance" INTEGER NOT NULL,
    "factualAccuracy" INTEGER NOT NULL,
    "groundingQuality" INTEGER NOT NULL,
    "educationalValue" INTEGER NOT NULL,
    "citationQuality" INTEGER,
    "revealedSolution" BOOLEAN,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expert_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "study_configs_subjectId_key" ON "study_configs"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "study_reviewers_subjectId_userId_key" ON "study_reviewers"("subjectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "study_consents_studentId_subjectId_consentVersion_key" ON "study_consents"("studentId", "subjectId", "consentVersion");

-- CreateIndex
CREATE INDEX "answer_ratings_subjectId_idx" ON "answer_ratings"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "answer_ratings_messageId_studentId_key" ON "answer_ratings"("messageId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "survey_responses_studentId_subjectId_instrument_key" ON "survey_responses"("studentId", "subjectId", "instrument");

-- CreateIndex
CREATE INDEX "expert_reviews_subjectId_idx" ON "expert_reviews"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "expert_reviews_messageId_reviewerId_key" ON "expert_reviews"("messageId", "reviewerId");

-- AddForeignKey
ALTER TABLE "study_configs" ADD CONSTRAINT "study_configs_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_reviewers" ADD CONSTRAINT "study_reviewers_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_reviewers" ADD CONSTRAINT "study_reviewers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_consents" ADD CONSTRAINT "study_consents_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_consents" ADD CONSTRAINT "study_consents_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_ratings" ADD CONSTRAINT "answer_ratings_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_ratings" ADD CONSTRAINT "answer_ratings_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_ratings" ADD CONSTRAINT "answer_ratings_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expert_reviews" ADD CONSTRAINT "expert_reviews_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expert_reviews" ADD CONSTRAINT "expert_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expert_reviews" ADD CONSTRAINT "expert_reviews_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

