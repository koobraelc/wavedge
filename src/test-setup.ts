import { validateEnv } from "./config/env.js";

// Ensure env config is initialized before any test modules import getEnvConfig()
validateEnv();
