import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { rawNotes, transcript, prompt } = await request.json();

    if (!rawNotes && !transcript) {
      return NextResponse.json(
        { error: "No notes or transcript provided" },
        { status: 400 }
      );
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 120_000,
    });

    let inputContent = "";
    if (rawNotes) {
      inputContent += `RAW NOTES:\n${rawNotes}\n\n`;
    }
    if (transcript) {
      inputContent += `TRANSCRIPT:\n${transcript}\n\n`;
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: `${prompt}\n\n---\n\n${inputContent}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const formatted = textBlock ? textBlock.text : "";

    return NextResponse.json({ formatted });
  } catch (error) {
    console.error("Format API error:", error);
    return NextResponse.json(
      { error: "Failed to format notes" },
      { status: 500 }
    );
  }
}
