/*
  Warnings:

  - Made the column `libraryId` on table `BookCopy` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "BookCopy" DROP CONSTRAINT "BookCopy_libraryId_fkey";

-- AlterTable
ALTER TABLE "BookCopy" ALTER COLUMN "libraryId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "BookCopy" ADD CONSTRAINT "BookCopy_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "Library"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
