import { NextResponse } from "next/server";
import { createBot } from "@/lib/telegram-bot";
import { webhookCallback } from "grammy";

export const maxDuration = 120;

let handler: ((req: Request) => Promise<Response>) | null = null;

function getHandler() {
  if (handler) return handler;
  const bot = createBot();
  if (!bot) return null;
  handler = webhookCallback(bot, "std/http") as (req: Request) => Promise<Response>;
  return handler;
}

export async function POST(request: Request) {
  const h = getHandler();
  if (!h) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN not configured" },
      { status: 500 }
    );
  }

  try {
    return await h(request);
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}

// Telegram sends GET to verify webhook URL
export async function GET() {
  return NextResponse.json({ status: "Telegram webhook active" });
}
