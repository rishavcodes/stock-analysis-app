-- CreateTable
CREATE TABLE "sector_data" (
    "id" SERIAL NOT NULL,
    "sector" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "avgChange" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topGainerSymbol" TEXT NOT NULL DEFAULT '',
    "topGainerChange" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topLoserSymbol" TEXT NOT NULL DEFAULT '',
    "topLoserChange" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sectorScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stockCount" INTEGER NOT NULL DEFAULT 0,
    "advances" INTEGER NOT NULL DEFAULT 0,
    "declines" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sector_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_state" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "rawRegime" TEXT NOT NULL,
    "regime" TEXT NOT NULL,
    "smoothed" BOOLEAN NOT NULL DEFAULT false,
    "niftyClose" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sector_data_sector_date_key" ON "sector_data"("sector", "date");

-- CreateIndex
CREATE UNIQUE INDEX "market_state_date_key" ON "market_state"("date");

-- CreateIndex
CREATE INDEX "market_state_date_idx" ON "market_state"("date" DESC);
