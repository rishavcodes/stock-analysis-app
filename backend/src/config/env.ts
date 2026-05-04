import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // MongoDB — retained for AnalysisLog (and, during phased migration, any
  // model that hasn't been moved to Postgres yet).
  MONGODB_URI: z.string().min(1),

  // PostgreSQL (Supabase). Optional while we're mid-migration; the app boots
  // without it as long as no Postgres-backed model has been activated yet.
  // DATABASE_URL  → pooled connection (pgBouncer) used by the running app.
  // DIRECT_URL    → direct connection used only for `prisma migrate`.
  // See docs/POSTGRES_SETUP.md.
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),

  // Angel One SmartAPI
  SMARTAPI_API_KEY: z.string().min(1),
  SMARTAPI_CLIENT_CODE: z.string().min(1),
  SMARTAPI_PASSWORD: z.string().min(1),
  SMARTAPI_TOTP_SECRET: z.string().min(1),

  // Alpha Vantage
  ALPHA_VANTAGE_API_KEY: z.string().min(1),

  // Anthropic Claude
  ANTHROPIC_API_KEY: z.string().min(1),

  // Server
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Comma-separated list of origins allowed to call the API. Empty in dev
  // means "allow any origin" (matches the historical permissive default);
  // production must set this to the Vercel URL(s).
  ALLOWED_ORIGINS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
