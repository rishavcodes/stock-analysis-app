-- CreateTable
CREATE TABLE "stock_metrics" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "pe" DOUBLE PRECISION,
    "roe" DOUBLE PRECISION,
    "roce" DOUBLE PRECISION,
    "debtToEquity" DOUBLE PRECISION,
    "revenueGrowthYoY" DOUBLE PRECISION,
    "profitGrowthYoY" DOUBLE PRECISION,
    "profitMargin" DOUBLE PRECISION,
    "marketCap" DOUBLE PRECISION,
    "bookValue" DOUBLE PRECISION,
    "dividendYield" DOUBLE PRECISION,
    "promoterHolding" DOUBLE PRECISION,
    "quarterlyEpsGrowth" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "earningsConsistencyScore" DOUBLE PRECISION,
    "sma20" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sma50" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sma200" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ema20" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rsi14" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "macdLine" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "macdSignal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "macdHistogram" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bollingerUpper" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bollingerLower" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgVolume20" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volumeRatio" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fundamentalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "technicalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sectorScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "marketScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volatility20d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxDrawdown90d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "atr14" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tradedValue20d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adjustedFinalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isBreakout" BOOLEAN NOT NULL DEFAULT false,
    "breakoutType" TEXT,
    "trendDirection" TEXT NOT NULL DEFAULT 'SIDEWAYS',
    "marketRegime" TEXT,
    "weightsUsed" JSONB,
    "fundamentalsUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_metrics_finalScore_idx" ON "stock_metrics"("finalScore" DESC);

-- CreateIndex
CREATE INDEX "stock_metrics_adjustedFinalScore_idx" ON "stock_metrics"("adjustedFinalScore" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "stock_metrics_symbol_date_key" ON "stock_metrics"("symbol", "date");
