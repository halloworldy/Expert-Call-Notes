import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";

interface CallData {
  expert_name: string;
  position?: string | null;
  call_date: string;
  formatted_output: string;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*{1,2}/g, "")
    .replace(/_{1,2}/g, "")
    .replace(/<\/?u>/g, "")
    .trim();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTocDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const month = months[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

// Parse formatted_output text into structured sections for the document.
// Uses cleanLine for structural matching but returns clean text (no raw markers).
function parseFormattedOutput(text: string): {
  background: { text: string; subItems: string[] }[];
  sections: { number: string; header: string; subBullets: { letter: string; text: string; romanItems: { numeral: string; text: string }[] }[] }[];
} {
  const background: { text: string; subItems: string[] }[] = [];
  const sections: { number: string; header: string; subBullets: { letter: string; text: string; romanItems: { numeral: string; text: string }[] }[] }[] = [];
  const lines = text.split("\n");

  let currentSection: (typeof sections)[0] | null = null;
  let currentSubBullet: (typeof sections)[0]["subBullets"][0] | null = null;
  let currentBgBullet: (typeof background)[0] | null = null;
  let inBackground = false;
  let inSummary = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const cleanLine = stripMarkdown(line);

    if (cleanLine.match(/^Background\s*$/i)) {
      inBackground = true;
      inSummary = false;
      continue;
    }
    if (cleanLine.match(/^Summary\s*$/i)) {
      if (currentBgBullet) { background.push(currentBgBullet); currentBgBullet = null; }
      inBackground = false;
      inSummary = true;
      continue;
    }

    if (inBackground) {
      const bgBulletMatch = cleanLine.match(/^\*\s+(.+)$/);
      if (bgBulletMatch) {
        if (currentBgBullet) background.push(currentBgBullet);
        currentBgBullet = { text: bgBulletMatch[1], subItems: [] };
        continue;
      }
      const bgSubMatch = cleanLine.match(/^\s*o\s+(.+)$/);
      if (bgSubMatch && currentBgBullet) {
        currentBgBullet.subItems.push(bgSubMatch[1]);
        continue;
      }
      if (currentBgBullet) {
        currentBgBullet.text += " " + cleanLine;
      }
      continue;
    }

    const numberedHeaderMatch = cleanLine.match(/^\s*(?:#{1,3}\s+)?(\d+)\.\s+(.+)$/);
    const markdownHeaderMatch = !numberedHeaderMatch && cleanLine.match(/^\s*#{1,3}\s+(.+)$/);

    if (numberedHeaderMatch) {
      if (currentSubBullet && currentSection) { currentSection.subBullets.push(currentSubBullet); currentSubBullet = null; }
      if (currentSection) sections.push(currentSection);
      currentSection = { number: numberedHeaderMatch[1], header: numberedHeaderMatch[2].trim(), subBullets: [] };
      if (!inSummary) inSummary = true;
      continue;
    }

    if (markdownHeaderMatch) {
      if (currentSubBullet && currentSection) { currentSection.subBullets.push(currentSubBullet); currentSubBullet = null; }
      if (currentSection) sections.push(currentSection);
      currentSection = { number: String(sections.length + 1), header: markdownHeaderMatch[1].trim(), subBullets: [] };
      continue;
    }

    const romanMatch = cleanLine.match(/^\s*(i{1,3}|iv|vi{0,3}|ix|x{0,3})[.)]\s+(.+)$/);
    if (romanMatch && currentSubBullet) {
      currentSubBullet.romanItems.push({ numeral: romanMatch[1], text: romanMatch[2].trim() });
      continue;
    }

    const subBulletMatch = cleanLine.match(/^\s*([a-z])[.)]\s+(.+)$/);
    if (subBulletMatch && currentSection) {
      if (currentSubBullet) currentSection.subBullets.push(currentSubBullet);
      currentSubBullet = { letter: subBulletMatch[1], text: subBulletMatch[2].trim(), romanItems: [] };
      continue;
    }

    if (currentSubBullet) {
      currentSubBullet.text += " " + cleanLine;
    } else if (currentSection) {
      currentSection.header += " " + cleanLine;
    }
  }

  if (currentBgBullet) background.push(currentBgBullet);
  if (currentSubBullet && currentSection) currentSection.subBullets.push(currentSubBullet);
  if (currentSection) sections.push(currentSection);

  return { background, sections };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfContent = any;

function buildCallContent(call: CallData): PdfContent[] {
  const content: PdfContent[] = [];
  const { background, sections } = parseFormattedOutput(call.formatted_output);

  // Call header
  content.push({
    text: call.expert_name,
    fontSize: 17,
    bold: true,
    color: "#1a365d",
    margin: [0, 0, 0, 2],
  });

  // Position
  if (call.position) {
    content.push({
      text: call.position,
      fontSize: 10,
      color: "#475569",
      margin: [0, 0, 0, 2],
    });
  }

  // Rule
  content.push({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: 475, y2: 0, lineWidth: 1.5, lineColor: "#2d5899" }],
    margin: [0, 0, 0, 6],
  });

  // Date
  content.push({
    text: formatDate(call.call_date),
    fontSize: 9,
    italics: true,
    color: "#94a3b8",
    margin: [0, 0, 0, 16],
  });

  // Background section
  if (background.length > 0) {
    content.push({
      text: "Background",
      fontSize: 12,
      bold: true,
      color: "#1a365d",
      margin: [0, 0, 0, 6],
    });

    for (const bullet of background) {
      content.push({
        text: `\u2022  ${bullet.text}`,
        fontSize: 10,
        color: "#000000",
        margin: [15, 2, 0, 2],
      });
      for (const sub of bullet.subItems) {
        content.push({
          text: `o  ${sub}`,
          fontSize: 10,
          color: "#000000",
          margin: [35, 1, 0, 1],
        });
      }
    }

    content.push({ text: "", margin: [0, 6, 0, 0] });
  }

  // Summary sections
  if (sections.length > 0) {
    if (background.length > 0) {
      content.push({
        text: "Summary",
        fontSize: 12,
        bold: true,
        color: "#1a365d",
        margin: [0, 6, 0, 6],
      });
    }

    for (const section of sections) {
      content.push({
        text: `${section.number}. ${section.header}`,
        fontSize: 11,
        bold: true,
        color: "#1a365d",
        margin: [0, 8, 0, 4],
      });

      for (const sub of section.subBullets) {
        content.push({
          text: `${sub.letter}. ${sub.text}`,
          fontSize: 10,
          color: "#000000",
          margin: [25, 2, 0, 2],
        });

        for (const roman of sub.romanItems) {
          content.push({
            text: `${roman.numeral}. ${roman.text}`,
            fontSize: 10,
            color: "#000000",
            margin: [50, 1, 0, 1],
          });
        }
      }

      content.push({ text: "", margin: [0, 6, 0, 0] });
    }
  } else if (background.length === 0) {
    // Fallback: render as plain paragraphs
    const lines = call.formatted_output.split("\n");
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        content.push({ text: " ", fontSize: 6 });
        continue;
      }
      const cleanText = stripMarkdown(trimmed);
      const isHeader = /^#{1,6}\s/.test(trimmed) || /^\d+\.\s/.test(trimmed);
      content.push({
        text: cleanText,
        fontSize: isHeader ? 11 : 10,
        bold: isHeader,
        color: isHeader ? "#1a365d" : "#000000",
        margin: [0, 2, 0, 2],
      });
    }
  }

  return content;
}

export async function POST(request: Request) {
  try {
    const { projectName, calls, exportTitle, exportSubtitle } =
      (await request.json()) as {
        projectName: string;
        calls: CallData[];
        exportTitle?: string;
        exportSubtitle?: string;
      };

    const title = exportTitle || projectName;
    const subtitle = exportSubtitle || "Expert Call Diligence Report";

    // Load Roboto fonts from pdfmake
    const fontsDir = path.join(process.cwd(), "node_modules/pdfmake/build/fonts/Roboto");
    const fonts = {
      Roboto: {
        normal: fs.readFileSync(path.join(fontsDir, "Roboto-Regular.ttf")),
        bold: fs.readFileSync(path.join(fontsDir, "Roboto-Medium.ttf")),
        italics: fs.readFileSync(path.join(fontsDir, "Roboto-Italic.ttf")),
        bolditalics: fs.readFileSync(path.join(fontsDir, "Roboto-MediumItalic.ttf")),
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PdfPrinter = require("pdfmake/js/Printer").default || require("pdfmake/js/Printer");
    const printer = new PdfPrinter(fonts);

    // Build document content
    const content: PdfContent[] = [];

    // ---- TITLE PAGE ----
    content.push({ text: "", margin: [0, 180, 0, 0] });
    content.push({
      text: title,
      fontSize: 28,
      bold: true,
      color: "#1a365d",
      alignment: "center",
      margin: [0, 0, 0, 12],
    });
    content.push({
      canvas: [{ type: "line", x1: 195, y1: 0, x2: 280, y2: 0, lineWidth: 2, lineColor: "#2d5899" }],
      alignment: "center",
      margin: [0, 0, 0, 12],
    });
    content.push({
      text: subtitle,
      fontSize: 14,
      color: "#64748b",
      alignment: "center",
      margin: [0, 0, 0, 8],
    });
    content.push({
      text: formatDate(new Date().toISOString()),
      fontSize: 11,
      color: "#94a3b8",
      alignment: "center",
    });
    content.push({ text: "", pageBreak: "after" });

    // ---- TABLE OF CONTENTS ----
    content.push({
      text: "Table of Contents",
      fontSize: 20,
      bold: true,
      color: "#1a365d",
      margin: [0, 0, 0, 4],
    });
    content.push({
      canvas: [{ type: "line", x1: 0, y1: 0, x2: 475, y2: 0, lineWidth: 0.5, lineColor: "#e2e8f0" }],
      margin: [0, 0, 0, 16],
    });

    calls.forEach((call, i) => {
      let tocText = call.expert_name;
      if (call.position) tocText += ` - ${call.position}`;
      tocText += ` - (${formatTocDate(call.call_date)})`;

      content.push({
        columns: [
          {
            text: `${i + 1}. ${tocText}`,
            fontSize: 10,
            color: "#1a365d",
            width: "*",
          },
          {
            text: `${i + 3}`,
            fontSize: 10,
            color: "#94a3b8",
            width: 30,
            alignment: "right",
          },
        ],
        margin: [0, 4, 0, 4],
      });
    });
    content.push({ text: "", pageBreak: "after" });

    // ---- CALL PAGES ----
    calls.forEach((call, i) => {
      const callContent = buildCallContent(call);
      content.push(...callContent);
      if (i < calls.length - 1) {
        content.push({ text: "", pageBreak: "after" });
      }
    });

    const docDefinition = {
      pageSize: "A4" as const,
      pageMargins: [60, 60, 60, 60] as [number, number, number, number],
      defaultStyle: {
        font: "Roboto",
        fontSize: 10,
        color: "#000000",
        lineHeight: 1.4,
      },
      info: {
        title: `${title} - Diligence Report`,
        author: "Expert Call Notes",
      },
      footer: (currentPage: number) => {
        if (currentPage === 1) return { text: "" };
        return {
          text: String(currentPage),
          fontSize: 9,
          color: "#94a3b8",
          alignment: "center" as const,
          margin: [0, 20, 0, 0] as [number, number, number, number],
        };
      },
      content,
    };

    const pdfDoc = await printer.createPdfKitDocument(docDefinition);
    const chunks: Buffer[] = [];

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
      pdfDoc.on("error", reject);
      pdfDoc.end();
    });

    const now = new Date();
    const d = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
    const fileName = `${d} - ${title} - ${subtitle}`.replace(/[/\\?%*:|"<>]/g, "");

    return new Response(pdfBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}.pdf"`,
      },
    });
  } catch (error) {
    console.error("PDF export error:", error);
    return NextResponse.json(
      { error: "Failed to export PDF" },
      { status: 500 }
    );
  }
}
