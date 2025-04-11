-- AlterTable
ALTER TABLE "SavedDesign" ADD COLUMN     "isLogoMode" BOOLEAN,
ADD COLUMN     "logoOffsetX" DOUBLE PRECISION,
ADD COLUMN     "logoOffsetY" DOUBLE PRECISION,
ADD COLUMN     "logoScale" DOUBLE PRECISION,
ADD COLUMN     "logoTargetPart" TEXT,
ADD COLUMN     "shirtColorHex" TEXT;
