-- CreateTable
CREATE TABLE "candles" (
    "stockToken" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candles_pkey" PRIMARY KEY ("stockToken","interval","timestamp")
);

-- Convert candles into a TimescaleDB hypertable partitioned by `timestamp`.
-- This must run AFTER the CREATE TABLE above. The table is empty here, so
-- migrate_data is unnecessary; if_not_exists keeps the migration idempotent
-- if you re-run against an already-hypertabled DB.
SELECT create_hypertable(
    'candles',
    'timestamp',
    if_not_exists => TRUE
);
