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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfContent = any;

// Check if a line is a standalone image marker
function isImageLine(line: string): boolean {
  return /^!\[image\]\([^)]+\)$/.test(line.trim());
}

// Create a pdfmake image node from a base64 data URI
function createPdfImage(dataUri: string, margin?: number[]): PdfContent {
  return {
    image: dataUri,
    width: 400,
    margin: margin || [0, 4, 0, 4],
  };
}

// Parse inline formatting markers (**bold**, _italic_, <u>underline</u>) into pdfmake text array
function parseInlineFormattingPdf(
  text: string,
  baseStyle: { fontSize: number; color: string; bold?: boolean; italics?: boolean }
): PdfContent {
  const regex = /(\*\*(.+?)\*\*)|(_(.+?)_)|(<u>(.+?)<\/u>)/g;
  let lastIndex = 0;
  let match;
  const parts: PdfContent[] = [];
  let hasFormatting = false;

  while ((match = regex.exec(text)) !== null) {
    hasFormatting = true;
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), ...baseStyle });
    }
    if (match[2]) {
      parts.push({ text: match[2], ...baseStyle, bold: true });
    } else if (match[4]) {
      parts.push({ text: match[4], ...baseStyle, italics: true });
    } else if (match[6]) {
      parts.push({ text: match[6], ...baseStyle, decoration: "underline" });
    }
    lastIndex = match.index + match[0].length;
  }

  if (!hasFormatting) {
    // No formatting markers found — return clean text as simple string
    return stripMarkdown(text);
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), ...baseStyle });
  }

  return parts;
}

// Build a pdfmake text node with optional prefix and inline formatting
function buildFormattedTextNode(
  prefix: string,
  rawText: string,
  baseStyle: { fontSize: number; color: string },
  margin: number[],
): PdfContent {
  const formatted = parseInlineFormattingPdf(rawText, baseStyle);
  if (Array.isArray(formatted)) {
    // Has inline formatting — build text array with prefix
    return {
      text: [
        { text: prefix, ...baseStyle },
        ...formatted,
      ],
      margin,
    };
  }
  // Plain text
  return {
    text: `${prefix}${formatted}`,
    ...baseStyle,
    margin,
  };
}

// Parse formatted_output into structured sections, preserving raw markers for inline formatting
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

    const trimmedLine = line.trim(); // preserves formatting markers

    // Skip standalone image lines — handled separately during rendering
    if (isImageLine(trimmedLine)) continue;

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
        // Use trimmedLine to preserve inline formatting markers
        const rawText = trimmedLine.replace(/^\*\s+/, "");
        currentBgBullet = { text: rawText, subItems: [] };
        continue;
      }
      const bgSubMatch = cleanLine.match(/^\s*o\s+(.+)$/);
      if (bgSubMatch && currentBgBullet) {
        const rawSubText = trimmedLine.replace(/^\s*o\s+/, "");
        currentBgBullet.subItems.push(rawSubText);
        continue;
      }
      if (currentBgBullet) {
        currentBgBullet.text += " " + trimmedLine;
      }
      continue;
    }

    const numberedHeaderMatch = cleanLine.match(/^\s*(?:#{1,3}\s+)?(\d+)\.\s+(.+)$/);
    const markdownHeaderMatch = !numberedHeaderMatch && cleanLine.match(/^\s*#{1,3}\s+(.+)$/);

    if (numberedHeaderMatch) {
      if (currentSubBullet && currentSection) { currentSection.subBullets.push(currentSubBullet); currentSubBullet = null; }
      if (currentSection) sections.push(currentSection);
      // Use clean header text (markers stripped) — headers are bold by style
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
      const rawRomanText = trimmedLine.replace(/^\s*(i{1,3}|iv|vi{0,3}|ix|x{0,3})[.)]\s+/, "");
      currentSubBullet.romanItems.push({ numeral: romanMatch[1], text: rawRomanText });
      continue;
    }

    const subBulletMatch = cleanLine.match(/^\s*([a-z])[.)]\s+(.+)$/);
    if (subBulletMatch && currentSection) {
      if (currentSubBullet) currentSection.subBullets.push(currentSubBullet);
      const rawSubText = trimmedLine.replace(/^\s*[a-z][.)]\s+/, "");
      currentSubBullet = { letter: subBulletMatch[1], text: rawSubText, romanItems: [] };
      continue;
    }

    if (currentSubBullet) {
      currentSubBullet.text += " " + trimmedLine;
    } else if (currentSection) {
      currentSection.header += " " + cleanLine;
    }
  }

  if (currentBgBullet) background.push(currentBgBullet);
  if (currentSubBullet && currentSection) currentSection.subBullets.push(currentSubBullet);
  if (currentSection) sections.push(currentSection);

  return { background, sections };
}

// Colors matching the browser preview exactly
const COLORS = {
  navyHeading: "#1a365d",
  darkText: "#0f172a",       // text-slate-900
  sectionLabel: "#1e293b",   // text-slate-800
  bodyText: "#000000",
  subtitleGray: "#64748b",
  mutedGray: "#94a3b8",
  accentBlue: "#2d5899",
  borderLight: "#e2e8f0",
  tocEntry: "#0f172a",
};

const SIZES = {
  titlePage: 26,
  subtitle: 14,
  titleDate: 12,
  tocHeading: 16,
  tocEntry: 10,
  tocPageNum: 9,
  callName: 15,
  callPosition: 9,
  callDate: 9,
  sectionLabel: 10.5,
  numberedHeader: 10.5,
  bodyText: 10.5,
};

// Content width for A4 with 56pt margins: 595.28 - 56 - 56 = 483.28
const CONTENT_WIDTH = 483;

function buildCallContent(call: CallData, callIndex: number): PdfContent[] {
  const content: PdfContent[] = [];
  const { background, sections } = parseFormattedOutput(call.formatted_output);
  const anchorId = `call_${callIndex}`;

  const bodyStyle = { fontSize: SIZES.bodyText, color: COLORS.bodyText };

  // Call header
  content.push({
    text: call.expert_name,
    id: anchorId,
    fontSize: SIZES.callName,
    bold: true,
    color: COLORS.navyHeading,
    margin: [0, 0, 0, 3],
  });

  // Position
  if (call.position) {
    content.push({
      text: call.position,
      fontSize: SIZES.callPosition,
      color: COLORS.subtitleGray,
      margin: [0, 0, 0, 3],
    });
  }

  // Accent line under header
  content.push({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 1.5, lineColor: COLORS.accentBlue }],
    margin: [0, 0, 0, 3],
  });

  // Date
  content.push({
    text: formatDate(call.call_date),
    fontSize: SIZES.callDate,
    italics: true,
    color: COLORS.mutedGray,
    margin: [0, 0, 0, 14],
  });

  // Background section
  if (background.length > 0) {
    // Label with bottom border
    content.push({
      stack: [
        { text: "Background", fontSize: SIZES.sectionLabel, bold: true, color: COLORS.sectionLabel },
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 0.5, lineColor: COLORS.borderLight }], margin: [0, 2, 0, 0] },
      ],
      margin: [0, 8, 0, 5],
    });

    for (const bullet of background) {
      // ml-4 indent with bullet char, inline formatting preserved
      content.push(buildFormattedTextNode("\u2022 ", bullet.text, bodyStyle, [12, 1, 0, 1]));
      for (const sub of bullet.subItems) {
        // ml-10 indent
        content.push(buildFormattedTextNode("o ", sub, bodyStyle, [30, 1, 0, 1]));
      }
    }
  }

  // Summary sections
  if (sections.length > 0) {
    if (background.length > 0) {
      content.push({
        stack: [
          { text: "Summary", fontSize: SIZES.sectionLabel, bold: true, color: COLORS.sectionLabel },
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 0.5, lineColor: COLORS.borderLight }], margin: [0, 2, 0, 0] },
        ],
        margin: [0, 8, 0, 5],
      });
    }

    for (const section of sections) {
      // Numbered header — bold by style, text already clean
      content.push({
        text: `${section.number}. ${section.header}`,
        fontSize: SIZES.numberedHeader,
        bold: true,
        color: COLORS.darkText,
        margin: [0, 7, 0, 3],
      });

      for (const sub of section.subBullets) {
        // Letter sub-bullets with inline formatting
        content.push(buildFormattedTextNode(`${sub.letter}. `, sub.text, bodyStyle, [18, 1, 0, 1]));

        for (const roman of sub.romanItems) {
          // Roman numeral items with inline formatting
          content.push(buildFormattedTextNode(`${roman.numeral}. `, roman.text, bodyStyle, [36, 1, 0, 1]));
        }
      }
    }
  } else if (background.length === 0) {
    // Fallback: render line-by-line with inline formatting
    const lines = call.formatted_output.split("\n");
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        content.push({ text: " ", fontSize: 4 });
        continue;
      }
      // Handle image lines in fallback
      const imgMatch = trimmed.match(/^!\[image\]\(([^)]+)\)$/);
      if (imgMatch) {
        content.push(createPdfImage(imgMatch[1]));
        continue;
      }
      const cleanText = stripMarkdown(trimmed);
      const isHeader = /^#{1,6}\s/.test(trimmed) || /^\d+\.\s/.test(trimmed);
      if (isHeader) {
        content.push({
          text: cleanText.replace(/^#{1,6}\s+/, ""),
          fontSize: SIZES.numberedHeader,
          bold: true,
          color: COLORS.darkText,
          margin: [0, 1, 0, 1],
        });
      } else {
        const formatted = parseInlineFormattingPdf(trimmed, bodyStyle);
        content.push({
          text: formatted,
          ...bodyStyle,
          margin: [0, 1, 0, 1],
        });
      }
    }
  }

  // Render standalone image lines from the formatted output
  const outputLines = call.formatted_output.split("\n");
  for (const outputLine of outputLines) {
    const trimmed = outputLine.trim();
    const imgMatch = trimmed.match(/^!\[image\]\(([^)]+)\)$/);
    if (imgMatch) {
      content.push(createPdfImage(imgMatch[1]));
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

    const content: PdfContent[] = [];

    // ---- TITLE PAGE ----
    // Vertically centered content
    content.push({ text: "", margin: [0, 200, 0, 0] });
    content.push({
      text: title,
      fontSize: SIZES.titlePage,
      bold: true,
      color: COLORS.navyHeading,
      alignment: "center",
      margin: [0, 0, 0, 12],
    });
    // Centered 60pt divider line
    const lineStart = (CONTENT_WIDTH - 60) / 2;
    content.push({
      canvas: [{ type: "line", x1: lineStart, y1: 0, x2: lineStart + 60, y2: 0, lineWidth: 2, lineColor: COLORS.accentBlue }],
      margin: [0, 0, 0, 12],
    });
    content.push({
      text: subtitle,
      fontSize: SIZES.subtitle,
      color: COLORS.subtitleGray,
      alignment: "center",
      margin: [0, 0, 0, 8],
    });
    content.push({
      text: formatDate(new Date().toISOString()),
      fontSize: SIZES.titleDate,
      color: COLORS.mutedGray,
      alignment: "center",
    });
    content.push({ text: "", pageBreak: "after" });

    // ---- TABLE OF CONTENTS ----
    content.push({
      text: "Table of Contents",
      fontSize: SIZES.tocHeading,
      bold: true,
      color: COLORS.navyHeading,
      margin: [0, 0, 0, 3],
    });
    content.push({
      canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 1.5, lineColor: COLORS.accentBlue }],
      margin: [0, 0, 0, 16],
    });

    // TOC entries with hyperlinks
    calls.forEach((call, i) => {
      let tocText = call.expert_name;
      if (call.position) tocText += ` - ${call.position}`;
      tocText += ` - (${formatTocDate(call.call_date)})`;
      const anchorId = `call_${i}`;

      content.push({
        columns: [
          {
            text: [
              { text: `${i + 1}. `, color: COLORS.tocEntry, fontSize: SIZES.tocEntry },
              { text: tocText, color: COLORS.tocEntry, fontSize: SIZES.tocEntry, linkToDestination: anchorId },
            ],
            width: "*",
          },
          {
            text: `${i + 3}`,
            fontSize: SIZES.tocPageNum,
            color: COLORS.mutedGray,
            width: 25,
            alignment: "right",
          },
        ],
        margin: [0, 4, 0, 4],
      });

      content.push({
        canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 0.3, lineColor: "#eef1f5" }],
        margin: [0, 0, 0, 0],
      });
    });
    content.push({ text: "", pageBreak: "after" });

    // ---- CALL PAGES ----
    calls.forEach((call, i) => {
      const callContent = buildCallContent(call, i);
      content.push(...callContent);
      if (i < calls.length - 1) {
        content.push({ text: "", pageBreak: "after" });
      }
    });

    const docDefinition = {
      pageSize: "A4" as const,
      pageMargins: [56, 48, 56, 48] as [number, number, number, number],
      defaultStyle: {
        font: "Roboto",
        fontSize: SIZES.bodyText,
        color: COLORS.bodyText,
        lineHeight: 1.5,
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
          color: COLORS.mutedGray,
          alignment: "center" as const,
          margin: [0, 12, 0, 0] as [number, number, number, number],
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
