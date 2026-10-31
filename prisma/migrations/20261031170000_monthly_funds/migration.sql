-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "fundId" TEXT,
ADD COLUMN     "period" TEXT;

-- AlterTable
ALTER TABLE "RosterMember" ADD COLUMN     "personKey" TEXT;

-- CreateTable
CREATE TABLE "Fund" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_fundId_period_key" ON "Event"("fundId", "period");

-- AddForeignKey
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

