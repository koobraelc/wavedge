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
  router.get("/", async (req: AuthenticatedRequest, res) => {
    try {
      const keys = await apiKeyRepo.listByUser(req.user!.id);
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
    } catch (err) {
      console.error("[ApiKeys] List error:", err);
      res.status(500).json({ error: "Failed to list API keys" });
    }
  });

  /**
   * POST /api/api-keys
   * Generate a new API key.
   */
  router.post("/", async (req: AuthenticatedRequest, res) => {
    try {
      const { name } = req.body;
      const keyName = typeof name === "string" && name.trim() ? name.trim().slice(0, 50) : "Default";

      const activeCount = await apiKeyRepo.countActive(req.user!.id);
      if (activeCount >= MAX_ACTIVE_KEYS) {
        res.status(400).json({
          error: `Maximum ${MAX_ACTIVE_KEYS} active API keys allowed. Revoke an existing key first.`,
        });
        return;
      }

      const { key, record } = await apiKeyRepo.create(req.user!.id, keyName);

      res.status(201).json({
        key, // Plaintext key — only shown once
        id: record.id,
        name: record.name,
        key_prefix: record.key_prefix,
        created_at: record.created_at,
      });
    } catch (err) {
      console.error("[ApiKeys] Create error:", err);
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  /**
   * DELETE /api/api-keys/:id
   * Revoke an API key.
   */
  router.delete("/:id", async (req: AuthenticatedRequest, res) => {
    try {
      const revoked = await apiKeyRepo.revoke(req.params.id as string, req.user!.id);
      if (!revoked) {
        res.status(404).json({ error: "API key not found or already revoked" });
        return;
      }
      res.json({ message: "API key revoked" });
    } catch (err) {
      console.error("[ApiKeys] Revoke error:", err);
      res.status(500).json({ error: "Failed to revoke API key" });
    }
  });

  /**
   * GET /api/api-keys/usage
   * Get API usage stats for the current user.
   */
  router.get("/usage", async (req: AuthenticatedRequest, res) => {
    try {
      const userRepo = new UserRepository();
      const today = new Date().toISOString().split("T")[0];
      const usageToday = await userRepo.getApiUsageCount(req.user!.id, today);
      const activeKeys = await apiKeyRepo.countActive(req.user!.id);

      res.json({
        usage_today: usageToday,
        daily_limit: 100,
        active_keys: activeKeys,
        max_keys: MAX_ACTIVE_KEYS,
      });
    } catch (err) {
      console.error("[ApiKeys] Usage error:", err);
      res.status(500).json({ error: "Failed to fetch API key usage" });
    }
  });

  return router;
}
