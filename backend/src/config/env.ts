import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // MongoDB
  MONGODB_URI: z.string().min(1),

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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
