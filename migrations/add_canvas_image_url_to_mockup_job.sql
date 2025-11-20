-- Migration: Add canvasImageUrl to MockupJob table
-- Date: 2025-10-06
-- Description: Adds a field to store the canvas screenshot URL for display purposes

-- Add the canvasImageUrl column to the MockupJob table
ALTER TABLE "MockupJob" 
ADD COLUMN "canvasImageUrl" TEXT;

-- Add an index for faster queries if needed
CREATE INDEX "MockupJob_canvasImageUrl_idx" ON "MockupJob"("canvasImageUrl");

-- Add comment to describe the field (PostgreSQL syntax)
COMMENT ON COLUMN "MockupJob"."canvasImageUrl" IS 'Canvas screenshot URL for display in the UI';