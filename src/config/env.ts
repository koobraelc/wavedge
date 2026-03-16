/**
 * Environment variable validation and centralized config.
 * Call validateEnv() at startup before any other imports that depend on these values.
 */

const isProduction = process.env.NODE_ENV === "production";

interface EnvConfig {
  JWT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRO_PRICE_ID: string;
  BASE_URL: string;
  APP_URL: string;
}

function fatal(msg: string): never {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

function warn(msg: string): void {
  console.warn(`WARNING: ${msg}`);
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value) return value;

  if (isProduction) {
    fatal(`Missing required environment variable: ${name}`);
  }

  if (fallback !== undefined) {
    warn(`${name} is not set — using development fallback. Do NOT deploy like this.`);
    return fallback;
  }

  warn(`${name} is not set.`);
  return "";
}

let config: EnvConfig | null = null;

export function validateEnv(): EnvConfig {
  if (config) return config;

  config = {
    JWT_SECRET: requireEnv("JWT_SECRET", "wavedge-dev-secret-change-in-production"),
    STRIPE_SECRET_KEY: requireEnv("STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: requireEnv("STRIPE_WEBHOOK_SECRET"),
    STRIPE_PRO_PRICE_ID: requireEnv("STRIPE_PRO_PRICE_ID"),
    BASE_URL: requireEnv("BASE_URL", "https://wavedge.io"),
    APP_URL: requireEnv("APP_URL", "http://localhost:3000"),
  };

  return config;
}

export function getEnvConfig(): EnvConfig {
  if (!config) {
    throw new Error("validateEnv() must be called before getEnvConfig()");
  }
  return config;
}
