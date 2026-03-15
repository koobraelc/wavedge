import express from "express";
import path from "path";
import rateLimit from "express-rate-limit";
import { createPricesRouter } from "./api/prices.js";
import { createNewsRouter } from "./api/news.js";
import { createTokensRouter } from "./api/tokens.js";
import { createSearchRouter } from "./api/search.js";

const app = express();

app.use(express.json());

// Rate limiting: 100 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
  });
});

app.use("/api", apiLimiter);
app.use("/api/prices", createPricesRouter());
app.use("/api/news", createNewsRouter());
app.use("/api/tokens", createTokensRouter());
app.use("/api/search", createSearchRouter());

// Serve static files from public directory
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

export { app };
