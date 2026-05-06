-- CreateEnum
CREATE TYPE "BulkImportSessionStatus" AS ENUM ('IN_PROGRESS', 'COMMITTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "BulkImportItemStatus" AS ENUM ('PENDING', 'PROCESSING', 'AUTO_OK', 'TO_REVIEW', 'MANUAL', 'DUPLICATE', 'ERROR');

-- CreateEnum
CREATE TYPE "BulkImportDecision" AS ENUM ('NONE', 'CREATE', 'MERGE', 'SKIP');

-- CreateTable
CREATE TABLE "BulkImportSession" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "BulkImportSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "totalFiles" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "BulkImportSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkImportItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "format" "FileFormat" NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadId" TEXT,
    "status" "BulkImportItemStatus" NOT NULL DEFAULT 'PENDING',
    "extractedTitle" TEXT,
    "extractedAuthor" TEXT,
    "extractedIsbn" TEXT,
    "candidatesJson" JSONB,
    "chosenCandidate" JSONB,
    "mergeIntoBookId" TEXT,
    "decision" "BulkImportDecision" NOT NULL DEFAULT 'NONE',
    "errorMessage" TEXT,
    "committedBookId" TEXT,
    "committedCopyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkImportSession_ownerId_status_idx" ON "BulkImportSession"("ownerId", "status");

-- CreateIndex
CREATE INDEX "BulkImportItem_sessionId_status_idx" ON "BulkImportItem"("sessionId", "status");

-- AddForeignKey
ALTER TABLE "BulkImportSession" ADD CONSTRAINT "BulkImportSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkImportItem" ADD CONSTRAINT "BulkImportItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BulkImportSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkImportItem" ADD CONSTRAINT "BulkImportItem_mergeIntoBookId_fkey" FOREIGN KEY ("mergeIntoBookId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;
