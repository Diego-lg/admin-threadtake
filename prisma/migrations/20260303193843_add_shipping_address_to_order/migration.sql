-- DropForeignKey
ALTER TABLE "SavedDesign" DROP CONSTRAINT "SavedDesign_colorId_fkey";

-- DropForeignKey
ALTER TABLE "SavedDesign" DROP CONSTRAINT "SavedDesign_sizeId_fkey";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shippingAddress" TEXT NOT NULL DEFAULT '';

-- AddForeignKey
ALTER TABLE "SavedDesign" ADD CONSTRAINT "SavedDesign_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedDesign" ADD CONSTRAINT "SavedDesign_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "Size"("id") ON DELETE SET NULL ON UPDATE CASCADE;
