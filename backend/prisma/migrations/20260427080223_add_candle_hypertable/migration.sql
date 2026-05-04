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
-- Hosts that lack the TimescaleDB extension (e.g. Supabase) skip the call
-- and keep `candles` as a plain table — query and PK semantics are identical;
-- only the on-disk partitioning differs. The next migration creates the
-- timestamp index unconditionally so the schema matches in either case.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('candles', 'timestamp', if_not_exists => TRUE);
    END IF;
END
$$;
