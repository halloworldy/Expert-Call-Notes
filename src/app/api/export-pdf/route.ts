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

// Parse formatted_output into structured sections (clean text, no markers)
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

// Colors matching the browser preview exactly
const COLORS = {
  navyHeading: "#1a365d",    // title, call name, TOC heading
  darkText: "#0f172a",       // numbered section headers (text-slate-900)
  sectionLabel: "#1e293b",   // Background/Summary labels (text-slate-800)
  bodyText: "#000000",       // body text (text-black)
  subtitleGray: "#64748b",   // subtitle, position text
  mutedGray: "#94a3b8",      // date, page numbers
  accentBlue: "#2d5899",     // divider lines
  borderLight: "#e2e8f0",    // light borders (border-slate-200)
  tocEntry: "#0f172a",       // TOC entry text
};

// Font sizes: preview px * 0.75 = pt (approximate)
const SIZES = {
  titlePage: 26,       // preview 26px → large title
  subtitle: 14,        // preview 14px
  titleDate: 12,       // preview 12px
  tocHeading: 16,      // preview 16px
  tocEntry: 10,        // preview 13px scaled for A4
  tocPageNum: 9,       // preview 11px scaled
  callName: 15,        // preview 18px → 13.5pt, slightly up for readability
  callPosition: 9,     // preview 11px
  callDate: 9,         // preview 11px
  sectionLabel: 10.5,  // preview 14px text-sm → 10.5pt
  numberedHeader: 10.5,// preview 14px text-sm bold
  bodyText: 10.5,      // preview 14px text-sm
};

function buildCallContent(call: CallData, callIndex: number): PdfContent[] {
  const content: PdfContent[] = [];
  const { background, sections } = parseFormattedOutput(call.formatted_output);
  const anchorId = `call_${callIndex}`;

  // Call header (preview: 18px bold #1a365d, border-bottom 2px #2d5899)
  content.push({
    text: call.expert_name,
    id: anchorId,
    fontSize: SIZES.callName,
    bold: true,
    color: COLORS.navyHeading,
    margin: [0, 0, 0, 3],
  });

  // Position (preview: 11px #475569)
  if (call.position) {
    content.push({
      text: call.position,
      fontSize: SIZES.callPosition,
      color: COLORS.subtitleGray,
      margin: [0, 0, 0, 3],
    });
  }

  // Border line under header (preview: border-bottom 2px solid #2d5899)
  content.push({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: 475, y2: 0, lineWidth: 1.5, lineColor: COLORS.accentBlue }],
    margin: [0, 0, 0, 3],
  });

  // Date (preview: 11px italic #94a3b8, marginBottom 20px)
  content.push({
    text: formatDate(call.call_date),
    fontSize: SIZES.callDate,
    italics: true,
    color: COLORS.mutedGray,
    margin: [0, 0, 0, 14],
  });

  // Background section
  if (background.length > 0) {
    // Label (preview: text-sm font-bold text-slate-800, border-b border-slate-200)
    content.push({
      stack: [
        { text: "Background", fontSize: SIZES.sectionLabel, bold: true, color: COLORS.sectionLabel },
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 475, y2: 0, lineWidth: 0.5, lineColor: COLORS.borderLight }], margin: [0, 2, 0, 0] },
      ],
      margin: [0, 8, 0, 5],
    });

    for (const bullet of background) {
      // Preview: ml-4 (16px ≈ 12pt), my-0.5
      content.push({
        text: `\u2022 ${bullet.text}`,
        fontSize: SIZES.bodyText,
        color: COLORS.bodyText,
        margin: [12, 1, 0, 1],
      });
      for (const sub of bullet.subItems) {
        // Preview: ml-10 (40px ≈ 30pt)
        content.push({
          text: `o ${sub}`,
          fontSize: SIZES.bodyText,
          color: COLORS.bodyText,
          margin: [30, 1, 0, 1],
        });
      }
    }
  }

  // Summary sections
  if (sections.length > 0) {
    if (background.length > 0) {
      // Summary label (same style as Background label)
      content.push({
        stack: [
          { text: "Summary", fontSize: SIZES.sectionLabel, bold: true, color: COLORS.sectionLabel },
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 475, y2: 0, lineWidth: 0.5, lineColor: COLORS.borderLight }], margin: [0, 2, 0, 0] },
        ],
        margin: [0, 8, 0, 5],
      });
    }

    for (const section of sections) {
      // Preview: mt-3 mb-1.5 font-bold text-slate-900 text-sm
      content.push({
        text: `${section.number}. ${section.header}`,
        fontSize: SIZES.numberedHeader,
        bold: true,
        color: COLORS.darkText,
        margin: [0, 7, 0, 3],
      });

      for (const sub of section.subBullets) {
        // Preview: ml-6 (24px ≈ 18pt), my-0.5, letter font-medium
        content.push({
          text: `${sub.letter}. ${sub.text}`,
          fontSize: SIZES.bodyText,
          color: COLORS.bodyText,
          margin: [18, 1, 0, 1],
        });

        for (const roman of sub.romanItems) {
          // Preview: ml-12 (48px ≈ 36pt)
          content.push({
            text: `${roman.numeral}. ${roman.text}`,
            fontSize: SIZES.bodyText,
            color: COLORS.bodyText,
            margin: [36, 1, 0, 1],
          });
        }
      }
    }
  } else if (background.length === 0) {
    // Fallback: render as plain paragraphs
    const lines = call.formatted_output.split("\n");
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        content.push({ text: " ", fontSize: 4 });
        continue;
      }
      const cleanText = stripMarkdown(trimmed);
      const isHeader = /^#{1,6}\s/.test(trimmed) || /^\d+\.\s/.test(trimmed);
      content.push({
        text: cleanText,
        fontSize: isHeader ? SIZES.numberedHeader : SIZES.bodyText,
        bold: isHeader,
        color: isHeader ? COLORS.darkText : COLORS.bodyText,
        margin: [0, 1, 0, 1],
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
    // Preview: centered, padding 80px, title 26px bold #1a365d
    content.push({ text: "", margin: [0, 160, 0, 0] });
    content.push({
      text: title,
      fontSize: SIZES.titlePage,
      bold: true,
      color: COLORS.navyHeading,
      alignment: "center",
      margin: [0, 0, 0, 10],
    });
    // Preview: 80px wide divider, 2px solid #2d5899
    content.push({
      canvas: [{ type: "line", x1: 195, y1: 0, x2: 280, y2: 0, lineWidth: 2, lineColor: COLORS.accentBlue }],
      alignment: "center",
      margin: [0, 0, 0, 10],
    });
    // Preview: 14px #64748b
    content.push({
      text: subtitle,
      fontSize: SIZES.subtitle,
      color: COLORS.subtitleGray,
      alignment: "center",
      margin: [0, 0, 0, 6],
    });
    // Preview: 12px #94a3b8
    content.push({
      text: formatDate(new Date().toISOString()),
      fontSize: SIZES.titleDate,
      color: COLORS.mutedGray,
      alignment: "center",
    });
    content.push({ text: "", pageBreak: "after" });

    // ---- TABLE OF CONTENTS ----
    // Preview: 16px bold #1a365d, border-bottom 2px #2d5899
    content.push({
      text: "Table of Contents",
      fontSize: SIZES.tocHeading,
      bold: true,
      color: COLORS.navyHeading,
      margin: [0, 0, 0, 3],
    });
    content.push({
      canvas: [{ type: "line", x1: 0, y1: 0, x2: 475, y2: 0, lineWidth: 1.5, lineColor: COLORS.accentBlue }],
      margin: [0, 0, 0, 16],
    });

    // TOC entries with hyperlinks to sections
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

      // Light bottom border between entries (preview: border-bottom 1px solid #eef1f5)
      content.push({
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 475, y2: 0, lineWidth: 0.3, lineColor: "#eef1f5" }],
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
