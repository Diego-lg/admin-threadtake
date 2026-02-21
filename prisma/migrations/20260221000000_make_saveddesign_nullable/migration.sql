-- Make SavedDesign.colorId and SavedDesign.sizeId nullable
-- This allows saving designs without specifying color or size (useful for mockup generation)

-- Alter the columns to allow nulls
ALTER TABLE "SavedDesign" ALTER COLUMN "colorId" DROP NOT NULL;
ALTER TABLE "SavedDesign" ALTER COLUMN "sizeId" DROP NOT NULL;
