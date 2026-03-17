import { NextRequest, NextResponse } from "next/server";
import { requirePro } from "@/lib/services/auth";
import { ApiKeyRepository } from "@/lib/db/api-key-repository";

const apiKeyRepo = new ApiKeyRepository();

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePro(request);
  if (result instanceof NextResponse) return result;

  try {
    const { id } = await params;
    const revoked = await apiKeyRepo.revoke(id, result.id);
    if (!revoked) {
      return NextResponse.json({ error: "API key not found or already revoked" }, { status: 404 });
    }
    return NextResponse.json({ message: "API key revoked" });
  } catch (err) {
    console.error("[ApiKeys] Revoke error:", err);
    return NextResponse.json({ error: "Failed to revoke API key" }, { status: 500 });
  }
}
