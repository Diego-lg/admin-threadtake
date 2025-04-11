-- AlterTable
ALTER TABLE "SavedDesign" ADD COLUMN     "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "savedDesignId" TEXT NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rating_userId_idx" ON "Rating"("userId");

-- CreateIndex
CREATE INDEX "Rating_savedDesignId_idx" ON "Rating"("savedDesignId");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_userId_savedDesignId_key" ON "Rating"("userId", "savedDesignId");

-- CreateIndex
CREATE INDEX "SavedDesign_averageRating_idx" ON "SavedDesign"("averageRating");

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_savedDesignId_fkey" FOREIGN KEY ("savedDesignId") REFERENCES "SavedDesign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
