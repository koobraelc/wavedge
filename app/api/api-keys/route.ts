import { NextRequest, NextResponse } from "next/server";
import { requirePro } from "@/lib/services/auth";
import { ApiKeyRepository } from "@/lib/db/api-key-repository";

const MAX_ACTIVE_KEYS = 5;
const apiKeyRepo = new ApiKeyRepository();

export async function GET(request: NextRequest) {
  const result = await requirePro(request);
  if (result instanceof NextResponse) return result;

  try {
    const keys = await apiKeyRepo.listByUser(result.id);
    const sanitized = keys.map((k) => ({
      id: k.id,
      name: k.name,
      key_prefix: k.key_prefix,
      created_at: k.created_at,
      last_used_at: k.last_used_at,
      revoked_at: k.revoked_at,
    }));
    return NextResponse.json({ keys: sanitized });
  } catch (err) {
    console.error("[ApiKeys] List error:", err);
    return NextResponse.json({ error: "Failed to list API keys" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const result = await requirePro(request);
  if (result instanceof NextResponse) return result;

  try {
    const { name } = await request.json();
    const keyName = typeof name === "string" && name.trim() ? name.trim().slice(0, 50) : "Default";

    const activeCount = await apiKeyRepo.countActive(result.id);
    if (activeCount >= MAX_ACTIVE_KEYS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_ACTIVE_KEYS} active API keys allowed. Revoke an existing key first.` },
        { status: 400 }
      );
    }

    const { key, record } = await apiKeyRepo.create(result.id, keyName);

    return NextResponse.json(
      {
        key,
        id: record.id,
        name: record.name,
        key_prefix: record.key_prefix,
        created_at: record.created_at,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[ApiKeys] Create error:", err);
    return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
  }
}
