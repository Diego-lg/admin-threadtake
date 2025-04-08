-- CreateEnum
CREATE TYPE "MetricType" AS ENUM ('REVENUE', 'UNITS_SOLD');

-- CreateEnum
CREATE TYPE "TimePeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "SalesGoal" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "metricType" "MetricType" NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "timePeriod" "TimePeriod" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesGoal_storeId_idx" ON "SalesGoal"("storeId");

-- CreateIndex
CREATE INDEX "SalesGoal_storeId_timePeriod_idx" ON "SalesGoal"("storeId", "timePeriod");

-- AddForeignKey
ALTER TABLE "SalesGoal" ADD CONSTRAINT "SalesGoal_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
