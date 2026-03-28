import { Bot, Context, InlineKeyboard } from "grammy";
import { createServiceClient } from "./supabase-service";
import { DEFAULT_PROMPT } from "./default-prompt";
import Anthropic from "@anthropic-ai/sdk";
import type { Project } from "./types";

// In-memory state: Telegram chatId -> selected project
const chatState = new Map<number, { projectId: string; projectName: string }>();

function getBot(): Bot | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  return new Bot(token);
}

export function createBot(): Bot | null {
  const bot = getBot();
  if (!bot) return null;

  bot.command("start", handleStart);
  bot.command("projects", handleProjects);
  bot.command("selected", handleSelected);
  bot.command("help", handleHelp);
  bot.callbackQuery(/^select_project:/, handleProjectSelection);
  bot.on("message:text", handleTextMessage);

  return bot;
}

async function handleStart(ctx: Context) {
  await ctx.reply(
    "Welcome to Expert Call Notes Bot!\n\n" +
      "I can help you send raw call notes and get back formatted, investment-grade diligence notes.\n\n" +
      "Commands:\n" +
      "/projects - List and select a project\n" +
      "/selected - Show currently selected project\n" +
      "/help - Show this help message\n\n" +
      "To format notes: select a project, then send me raw notes or a transcript as a text message."
  );
}

async function handleHelp(ctx: Context) {
  await ctx.reply(
    "How to use this bot:\n\n" +
      "1. Use /projects to pick a project\n" +
      "2. Send raw call notes or a transcript as a text message\n" +
      "3. I'll format them using Claude AI and save them to your project\n" +
      "4. The formatted notes will be sent back to you here\n\n" +
      "Tip: Include the expert's name on the first line for best results, e.g.:\n" +
      "Expert: John Smith\n" +
      "<your raw notes>"
  );
}

async function handleProjects(ctx: Context) {
  const supabase = createServiceClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, is_pinned")
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error || !projects || projects.length === 0) {
    await ctx.reply(
      "No projects found. Create a project in the web app first."
    );
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const project of projects as Project[]) {
    const pin = project.is_pinned ? "📌 " : "";
    keyboard.text(`${pin}${project.name}`, `select_project:${project.id}`).row();
  }

  await ctx.reply("Select a project:", { reply_markup: keyboard });
}

async function handleProjectSelection(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data || !ctx.chat) return;

  const projectId = data.replace("select_project:", "");

  const supabase = createServiceClient();
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .single();

  if (error || !project) {
    await ctx.answerCallbackQuery({ text: "Project not found" });
    return;
  }

  chatState.set(ctx.chat.id, {
    projectId: project.id,
    projectName: project.name,
  });

  await ctx.answerCallbackQuery({ text: `Selected: ${project.name}` });
  await ctx.reply(
    `Project selected: ${project.name}\n\nNow send me raw call notes or a transcript to format.`
  );
}

async function handleSelected(ctx: Context) {
  if (!ctx.chat) return;
  const state = chatState.get(ctx.chat.id);
  if (!state) {
    await ctx.reply("No project selected. Use /projects to pick one.");
    return;
  }
  await ctx.reply(`Currently selected project: ${state.projectName}`);
}

async function handleTextMessage(ctx: Context) {
  if (!ctx.chat || !ctx.message?.text) return;

  const state = chatState.get(ctx.chat.id);
  if (!state) {
    await ctx.reply(
      "Please select a project first using /projects"
    );
    return;
  }

  const rawText = ctx.message.text;
  if (rawText.length < 20) {
    await ctx.reply(
      "Message too short to be call notes. Send at least a few sentences."
    );
    return;
  }

  // Parse optional expert name from first line
  let expertName = "Unknown Expert";
  let rawNotes = rawText;
  const firstLine = rawText.split("\n")[0];
  const expertMatch = firstLine.match(/^expert:\s*(.+)/i);
  if (expertMatch) {
    expertName = expertMatch[1].trim();
    rawNotes = rawText.split("\n").slice(1).join("\n").trim();
  }

  await ctx.reply("Formatting your notes with Claude AI... This may take a minute.");

  try {
    // Format notes via Claude
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 120_000,
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: `${DEFAULT_PROMPT}\n\n---\n\nRAW NOTES:\n${rawNotes}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const formatted = textBlock ? textBlock.text : "";

    if (!formatted) {
      await ctx.reply("Formatting returned empty result. Please try again.");
      return;
    }

    // Get next sort order
    const supabase = createServiceClient();
    const { data: existing } = await supabase
      .from("expert_calls")
      .select("sort_order")
      .eq("project_id", state.projectId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

    // Save to database
    const { error: insertError } = await supabase.from("expert_calls").insert({
      project_id: state.projectId,
      expert_name: expertName,
      call_date: new Date().toISOString().split("T")[0],
      raw_notes: rawNotes,
      formatted_output: formatted,
      sort_order: nextOrder,
      entry_type: "auto-generated",
    });

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      await ctx.reply("Notes were formatted but failed to save to database. Here are the formatted notes:\n\n" + truncateForTelegram(formatted));
      return;
    }

    // Send formatted result back
    await ctx.reply(`Notes formatted and saved to "${state.projectName}"!\n\nExpert: ${expertName}\n\n---\n\n${truncateForTelegram(formatted)}`);
  } catch (error) {
    console.error("Telegram format error:", error);
    await ctx.reply("An error occurred while formatting. Please try again.");
  }
}

function truncateForTelegram(text: string): string {
  // Telegram message limit is 4096 chars
  const MAX = 4000;
  if (text.length <= MAX) return text;
  return text.slice(0, MAX) + "\n\n... (truncated, view full notes in the web app)";
}
