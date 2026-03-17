/**
 * Environment variable validation and centralized config for Next.js.
 */

interface EnvConfig {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRO_PRICE_ID: string;
  BASE_URL: string;
  APP_URL: string;
  CRON_SECRET: string;
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value) return value;

  // Don't throw during build phase — env vars are only available at runtime on Vercel
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isBuildPhase && fallback === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return fallback ?? "";
}

let config: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (config) return config;

  config = {
    STRIPE_SECRET_KEY: requireEnv("STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: requireEnv("STRIPE_WEBHOOK_SECRET"),
    STRIPE_PRO_PRICE_ID: requireEnv("STRIPE_PRO_PRICE_ID"),
    BASE_URL: requireEnv("BASE_URL", "https://wavedge.io"),
    APP_URL: requireEnv("APP_URL", "http://localhost:3000"),
    CRON_SECRET: requireEnv("CRON_SECRET"),
  };

  return config;
}
