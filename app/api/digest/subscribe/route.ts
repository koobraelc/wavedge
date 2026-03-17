import { NextRequest, NextResponse } from "next/server";
import { DigestRepository } from "@/lib/db/digest-repository";

const repo = new DigestRepository();

export async function POST(request: NextRequest) {
  const { email, telegram_chat_id, lang } = await request.json();
  const validLang = lang === "zh" ? "zh" : "en";

  if (!email && !telegram_chat_id) {
    return NextResponse.json({ error: "email or telegram_chat_id required" }, { status: 400 });
  }

  try {
    let subscriber;
    if (email) {
      subscriber = await repo.subscribeEmail(email, validLang);
    } else {
      subscriber = await repo.subscribeTelegram(telegram_chat_id, validLang);
    }
    return NextResponse.json({ data: subscriber });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
