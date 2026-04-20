import { defineConfig } from 'vitest/config';

// Provide placeholder env vars so src/config/env.ts passes Zod validation during tests.
// Real services that would call these at runtime should be mocked; tests only exercise
// pure logic (parsers, scorers, sizers).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    globals: false,
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://localhost:27017/test',
      SMARTAPI_API_KEY: 'test',
      SMARTAPI_CLIENT_CODE: 'test',
      SMARTAPI_PASSWORD: 'test',
      SMARTAPI_TOTP_SECRET: 'JBSWY3DPEHPK3PXP',
      ALPHA_VANTAGE_API_KEY: 'test',
      ANTHROPIC_API_KEY: 'test',
    },
  },
});
