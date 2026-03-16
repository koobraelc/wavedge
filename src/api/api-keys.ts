import { Router } from "express";
import { ApiKeyRepository } from "../db/api-key-repository.js";
import { UserRepository } from "../db/user-repository.js";
import { requireAuth, requirePro, type AuthenticatedRequest } from "../services/auth.js";

const MAX_ACTIVE_KEYS = 5;

export function createApiKeysRouter(): Router {
  const router = Router();
  const apiKeyRepo = new ApiKeyRepository();

  // All routes require auth + pro tier
  router.use(requireAuth as any, requirePro as any);

  /**
   * GET /api/api-keys
   * List all API keys for the current user.
   */
  router.get("/", (req: AuthenticatedRequest, res) => {
    const keys = apiKeyRepo.listByUser(req.user!.id);
    // Never return the hash
    const sanitized = keys.map((k) => ({
      id: k.id,
      name: k.name,
      key_prefix: k.key_prefix,
      created_at: k.created_at,
      last_used_at: k.last_used_at,
      revoked_at: k.revoked_at,
    }));
    res.json({ keys: sanitized });
  });

  /**
   * POST /api/api-keys
   * Generate a new API key.
   */
  router.post("/", (req: AuthenticatedRequest, res) => {
    const { name } = req.body;
    const keyName = typeof name === "string" && name.trim() ? name.trim().slice(0, 50) : "Default";

    const activeCount = apiKeyRepo.countActive(req.user!.id);
    if (activeCount >= MAX_ACTIVE_KEYS) {
      res.status(400).json({
        error: `Maximum ${MAX_ACTIVE_KEYS} active API keys allowed. Revoke an existing key first.`,
      });
      return;
    }

    const { key, record } = apiKeyRepo.create(req.user!.id, keyName);

    res.status(201).json({
      key, // Plaintext key — only shown once
      id: record.id,
      name: record.name,
      key_prefix: record.key_prefix,
      created_at: record.created_at,
    });
  });

  /**
   * DELETE /api/api-keys/:id
   * Revoke an API key.
   */
  router.delete("/:id", (req: AuthenticatedRequest, res) => {
    const revoked = apiKeyRepo.revoke(req.params.id as string, req.user!.id);
    if (!revoked) {
      res.status(404).json({ error: "API key not found or already revoked" });
      return;
    }
    res.json({ message: "API key revoked" });
  });

  /**
   * GET /api/api-keys/usage
   * Get API usage stats for the current user.
   */
  router.get("/usage", (req: AuthenticatedRequest, res) => {
    const userRepo = new UserRepository();
    const today = new Date().toISOString().split("T")[0];
    const usageToday = userRepo.getApiUsageCount(req.user!.id, today);
    const activeKeys = apiKeyRepo.countActive(req.user!.id);

    res.json({
      usage_today: usageToday,
      daily_limit: 100,
      active_keys: activeKeys,
      max_keys: MAX_ACTIVE_KEYS,
    });
  });

  return router;
}
