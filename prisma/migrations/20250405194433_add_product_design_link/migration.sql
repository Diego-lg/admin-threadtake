/*
  Warnings:

  - A unique constraint covering the columns `[savedDesignId]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[derivedProductId]` on the table `SavedDesign` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "savedDesignId" TEXT;

-- AlterTable
ALTER TABLE "SavedDesign" ADD COLUMN     "derivedProductId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Product_savedDesignId_key" ON "Product"("savedDesignId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedDesign_derivedProductId_key" ON "SavedDesign"("derivedProductId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_savedDesignId_fkey" FOREIGN KEY ("savedDesignId") REFERENCES "SavedDesign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
