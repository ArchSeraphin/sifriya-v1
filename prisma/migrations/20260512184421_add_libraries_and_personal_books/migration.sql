-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "isPersonal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "BookCopy" ADD COLUMN     "libraryId" TEXT;

-- CreateTable
CREATE TABLE "Library" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryMembership" (
    "id" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Library_isDefault_idx" ON "Library"("isDefault");

-- CreateIndex
CREATE INDEX "Library_managerId_idx" ON "Library"("managerId");

-- CreateIndex
CREATE INDEX "LibraryMembership_userId_idx" ON "LibraryMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryMembership_libraryId_userId_key" ON "LibraryMembership"("libraryId", "userId");

-- CreateIndex
CREATE INDEX "BookCopy_libraryId_idx" ON "BookCopy"("libraryId");

-- AddForeignKey
ALTER TABLE "BookCopy" ADD CONSTRAINT "BookCopy_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "Library"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Library" ADD CONSTRAINT "Library_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryMembership" ADD CONSTRAINT "LibraryMembership_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "Library"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryMembership" ADD CONSTRAINT "LibraryMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- V1.6 backfill: seed la Bibliothèque générale + memberships users existants + assigne libraryId aux copies
INSERT INTO "Library" (id, name, "isDefault", "createdAt", "updatedAt")
VALUES ('lib_generale', 'Bibliothèque générale', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO "LibraryMembership" (id, "libraryId", "userId", "addedAt")
SELECT gen_random_uuid()::text, 'lib_generale', id, NOW()
FROM "User"
ON CONFLICT ("libraryId", "userId") DO NOTHING;

UPDATE "BookCopy" SET "libraryId" = 'lib_generale' WHERE "libraryId" IS NULL;
