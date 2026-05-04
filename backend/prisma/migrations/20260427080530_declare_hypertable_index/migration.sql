-- TimescaleDB's create_hypertable() auto-creates an index on the partitioning
-- column. On hosts where the previous migration's hypertable conversion was
-- skipped (e.g. Supabase, no TimescaleDB), we still need that index manually.
-- IF NOT EXISTS makes this a no-op when the hypertable conversion did run.
CREATE INDEX IF NOT EXISTS "candles_timestamp_idx" ON "candles" ("timestamp" DESC);
