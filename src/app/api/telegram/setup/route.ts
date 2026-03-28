import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN not set in environment" },
      { status: 500 }
    );
  }

  try {
    const { webhookUrl } = await request.json();

    if (!webhookUrl) {
      return NextResponse.json(
        { error: "webhookUrl is required" },
        { status: 400 }
      );
    }

    // Register webhook with Telegram
    const telegramUrl = `https://api.telegram.org/bot${token}/setWebhook`;
    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message", "callback_query"],
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      return NextResponse.json(
        { error: "Failed to set webhook", details: result },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Telegram webhook registered",
      webhookUrl,
    });
  } catch (error) {
    console.error("Telegram setup error:", error);
    return NextResponse.json(
      { error: "Failed to set up Telegram webhook" },
      { status: 500 }
    );
  }
}

// GET to check current webhook info
export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN not set" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/getWebhookInfo`
    );
    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Telegram webhook info error:", error);
    return NextResponse.json(
      { error: "Failed to get webhook info" },
      { status: 500 }
    );
  }
}
