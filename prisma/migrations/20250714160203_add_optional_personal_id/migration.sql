/*
  Warnings:

  - A unique constraint covering the columns `[personalID]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "personalID" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_personalID_key" ON "users"("personalID");
