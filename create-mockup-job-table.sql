-- Create MockupJob table manually
CREATE TABLE IF NOT EXISTS "MockupJob" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "productId" TEXT,
    "colorId" TEXT,
    "sizeId" TEXT,
    "description" TEXT,
    "customText" TEXT,
    "shirtColorHex" TEXT,
    "isLogoMode" BOOLEAN,
    "logoScale" DOUBLE PRECISION,
    "logoOffsetX" DOUBLE PRECISION,
    "logoOffsetY" DOUBLE PRECISION,
    "logoTargetPart" TEXT,
    "uploadedLogoUrl" TEXT,
    "uploadedPatternUrl" TEXT,
    "mockupResults" JSONB,
    "error" TEXT,
    "designId" TEXT,
    "estimatedTimeRemaining" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockupJob_pkey" PRIMARY KEY ("id")
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "MockupJob_userId_idx" ON "MockupJob"("userId");
CREATE INDEX IF NOT EXISTS "MockupJob_status_idx" ON "MockupJob"("status");
CREATE INDEX IF NOT EXISTS "MockupJob_createdAt_idx" ON "MockupJob"("createdAt");
CREATE INDEX IF NOT EXISTS "MockupJob_userId_status_idx" ON "MockupJob"("userId", "status");

-- Add foreign key constraint to User table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'MockupJob_userId_fkey'
    ) THEN
        ALTER TABLE "MockupJob" ADD CONSTRAINT "MockupJob_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;