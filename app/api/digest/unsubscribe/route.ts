import { NextRequest, NextResponse } from "next/server";
import { DigestRepository } from "@/lib/db/digest-repository";

const repo = new DigestRepository();

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const success = await repo.unsubscribeByToken(token);
    if (success) {
      return new NextResponse(
        `<html><body style="font-family:system-ui;text-align:center;padding:60px">
          <h2>Unsubscribed</h2>
          <p>You have been removed from the Wavedge daily digest.</p>
        </body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    } else {
      return NextResponse.json({ error: "Invalid or expired unsubscribe token" }, { status: 404 });
    }
  } catch (err) {
    console.error("[Digest] Unsubscribe error:", err);
    return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const success = await repo.unsubscribeEmail(email);
    return NextResponse.json({ success });
  } catch (err) {
    console.error("[Digest] Unsubscribe email error:", err);
    return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
  }
}
