-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "billDate" TIMESTAMP(3),
ADD COLUMN     "checks" JSONB,
ADD COLUMN     "extracted" JSONB,
ADD COLUMN     "flagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "receiptKey" TEXT,
ADD COLUMN     "receiptPhash" TEXT,
ADD COLUMN     "receiptSha256" TEXT,
ADD COLUMN     "vendor" TEXT;

-- CreateIndex
CREATE INDEX "Expense_eventId_receiptSha256_idx" ON "Expense"("eventId", "receiptSha256");
