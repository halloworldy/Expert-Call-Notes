import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";

export const runtime = "nodejs";

interface CallData {
  expert_name: string;
  position?: string | null;
  call_date: string;
  formatted_output: string;
}

interface Section {
  number: string;
  header: string;
  subBullets: SubBullet[];
}

interface SubBullet {
  letter: string;
  text: string;
  romanItems: RomanItem[];
}

interface RomanItem {
  numeral: string;
  text: string;
}

interface BackgroundBullet {
  text: string;
  subItems: string[];
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*{1,2}/g, "")
    .replace(/_{1,2}/g, "")
    .replace(/<\/?u>/g, "")
    .trim();
}

// Render text with inline formatting (bold, italic, underline) using PDFKit
function renderFormattedPdfText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  options: { width: number; fontSize?: number; baseFont?: string; color?: string }
) {
  const fontSize = options.fontSize || 10;
  const baseFont = options.baseFont || "Helvetica";
  const color = options.color || "#000000";
  const regex = /(\*\*(.+?)\*\*)|(_(.+?)_)|(<u>(.+?)<\/u>)/g;
  let lastIndex = 0;
  let match;
  const segments: { text: string; bold?: boolean; italic?: boolean; underline?: boolean }[] = [];

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }
    if (match[2]) {
      segments.push({ text: match[2], bold: true });
    } else if (match[4]) {
      segments.push({ text: match[4], italic: true });
    } else if (match[6]) {
      segments.push({ text: match[6], underline: true });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  // If no formatting found, render plain
  if (segments.length <= 1 && !segments[0]?.bold && !segments[0]?.italic && !segments[0]?.underline) {
    doc.font(baseFont).fontSize(fontSize).fillColor(color).text(text, x, doc.y, { width: options.width });
    return;
  }

  // Render segments with continued:true
  segments.forEach((seg, i) => {
    const isLast = i === segments.length - 1;
    let font = baseFont;
    if (seg.bold) font = "Helvetica-Bold";
    else if (seg.italic) font = "Helvetica-Oblique";
    doc.font(font).fontSize(fontSize).fillColor(color);
    if (seg.underline) {
      doc.text(seg.text, x, doc.y, { width: options.width, continued: !isLast, underline: true });
    } else {
      doc.text(seg.text, !isLast ? undefined : x, doc.y, { width: options.width, continued: !isLast });
    }
  });
}

function parseFormattedOutput(text: string): {
  background: BackgroundBullet[];
  sections: Section[];
} {
  const background: BackgroundBullet[] = [];
  const sections: Section[] = [];
  const lines = text.split("\n");

  let currentSection: Section | null = null;
  let currentSubBullet: SubBullet | null = null;
  let currentBgBullet: BackgroundBullet | null = null;
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
      if (currentBgBullet) {
        background.push(currentBgBullet);
        currentBgBullet = null;
      }
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

    const numberedHeaderMatch = cleanLine.match(
      /^\s*(?:#{1,3}\s+)?(\d+)\.\s+(.+)$/
    );
    const markdownHeaderMatch =
      !numberedHeaderMatch && cleanLine.match(/^\s*#{1,3}\s+(.+)$/);

    if (numberedHeaderMatch) {
      if (currentSubBullet && currentSection) {
        currentSection.subBullets.push(currentSubBullet);
        currentSubBullet = null;
      }
      if (currentSection) sections.push(currentSection);
      currentSection = {
        number: numberedHeaderMatch[1],
        header: numberedHeaderMatch[2].trim(),
        subBullets: [],
      };
      if (!inSummary) inSummary = true;
      continue;
    }

    if (markdownHeaderMatch) {
      if (currentSubBullet && currentSection) {
        currentSection.subBullets.push(currentSubBullet);
        currentSubBullet = null;
      }
      if (currentSection) sections.push(currentSection);
      currentSection = {
        number: String(sections.length + 1),
        header: markdownHeaderMatch[1].trim(),
        subBullets: [],
      };
      continue;
    }

    const romanMatch = cleanLine.match(
      /^\s*(i{1,3}|iv|vi{0,3}|ix|x{0,3})[.)]\s+(.+)$/
    );
    if (romanMatch && currentSubBullet) {
      currentSubBullet.romanItems.push({
        numeral: romanMatch[1],
        text: romanMatch[2].trim(),
      });
      continue;
    }

    const subBulletMatch = cleanLine.match(/^\s*([a-z])[.)]\s+(.+)$/);
    if (subBulletMatch && currentSection) {
      if (currentSubBullet) {
        currentSection.subBullets.push(currentSubBullet);
      }
      currentSubBullet = {
        letter: subBulletMatch[1],
        text: subBulletMatch[2].trim(),
        romanItems: [],
      };
      continue;
    }

    if (currentSubBullet) {
      currentSubBullet.text += " " + cleanLine;
    } else if (currentSection) {
      currentSection.header += " " + cleanLine;
    }
  }

  if (currentBgBullet) background.push(currentBgBullet);
  if (currentSubBullet && currentSection) {
    currentSection.subBullets.push(currentSubBullet);
  }
  if (currentSection) sections.push(currentSection);

  return { background, sections };
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

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
      info: {
        Title: `${title} - Diligence Report`,
        Author: "Expert Call Notes",
      },
      autoFirstPage: true,
      bufferPages: true,
    });

    const chunks: Uint8Array[] = [];
    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));

    const pageWidth = 595.28;
    const ml = 60;
    const mr = 60;
    const contentWidth = pageWidth - ml - mr;

    // ---- TITLE PAGE (page 0) ----
    doc.moveDown(10);
    doc
      .font("Helvetica-Bold")
      .fontSize(28)
      .fillColor("#1a365d")
      .text(title, ml, doc.y, { width: contentWidth, align: "center" });
    doc.moveDown(0.8);
    doc
      .font("Helvetica")
      .fontSize(14)
      .fillColor("#64748b")
      .text(subtitle, ml, doc.y, {
        width: contentWidth,
        align: "center",
      });
    doc.moveDown(0.4);
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#94a3b8")
      .text(formatDate(new Date().toISOString()), ml, doc.y, {
        width: contentWidth,
        align: "center",
      });

    // ---- TABLE OF CONTENTS (page 1) ----
    doc.addPage();
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#1a365d")
      .text("Table of Contents", ml, doc.y, { width: contentWidth });
    doc.moveDown(0.3);

    doc
      .moveTo(ml, doc.y)
      .lineTo(pageWidth - mr, doc.y)
      .strokeColor("#e2e8f0")
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(0.8);

    // Render TOC entries with position and date format
    const tocYPositions: number[] = [];

    calls.forEach((call, i) => {
      tocYPositions.push(doc.y);

      // Build TOC entry: "1. Name - Position - (DD-Mon-YY)"
      let tocText = call.expert_name;
      if (call.position) {
        tocText += ` - ${call.position}`;
      }
      tocText += ` - (${formatTocDate(call.call_date)})`;

      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#1a365d")
        .text(`${i + 1}. `, ml, doc.y, { continued: true, goTo: `call-${i}` });
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#1a365d")
        .text(tocText, { goTo: `call-${i}` });
      doc.moveDown(0.4);
    });

    // ---- CALL SECTIONS ----
    const callPageNumbers: number[] = [];

    calls.forEach((call, i) => {
      doc.addPage();
      const range = doc.bufferedPageRange();
      callPageNumbers.push(range.count);
      doc.addNamedDestination(`call-${i}`);

      // Call header
      doc
        .font("Helvetica-Bold")
        .fontSize(17)
        .fillColor("#1a365d")
        .text(call.expert_name, ml, doc.y, { width: contentWidth });

      // Position line
      if (call.position) {
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#475569")
          .text(call.position, ml, doc.y + 2, { width: contentWidth });
      }

      // Rule under header
      const ruleY = doc.y + 4;
      doc
        .moveTo(ml, ruleY)
        .lineTo(pageWidth - mr, ruleY)
        .strokeColor("#2d5899")
        .lineWidth(1.5)
        .stroke();
      doc.y = ruleY + 8;

      // Date
      doc
        .font("Helvetica-Oblique")
        .fontSize(9)
        .fillColor("#94a3b8")
        .text(formatDate(call.call_date), ml, doc.y, { width: contentWidth });
      doc.moveDown(1);

      // Formatted content
      const { background, sections } = parseFormattedOutput(
        call.formatted_output
      );

      // Render background
      if (background.length > 0) {
        doc
          .font("Helvetica-Bold")
          .fontSize(12)
          .fillColor("#1a365d")
          .text("Background", ml, doc.y, { width: contentWidth });
        doc.moveDown(0.4);

        for (const bullet of background) {
          doc.font("Helvetica").fontSize(10).fillColor("#000000")
            .text("\u2022 ", ml + 15, doc.y, { width: contentWidth - 15, continued: true });
          renderFormattedPdfText(doc, bullet.text, ml + 15, { width: contentWidth - 15 });
          doc.moveDown(0.15);

          for (const sub of bullet.subItems) {
            doc.font("Helvetica").fontSize(10).fillColor("#000000")
              .text("o ", ml + 35, doc.y, { width: contentWidth - 35, continued: true });
            renderFormattedPdfText(doc, sub, ml + 35, { width: contentWidth - 35 });
            doc.moveDown(0.1);
          }
        }
        doc.moveDown(0.5);
      }

      // Render summary sections
      if (sections.length > 0) {
        if (background.length > 0) {
          doc
            .font("Helvetica-Bold")
            .fontSize(12)
            .fillColor("#1a365d")
            .text("Summary", ml, doc.y, { width: contentWidth });
          doc.moveDown(0.4);
        }

        for (const section of sections) {
          doc
            .font("Helvetica-Bold")
            .fontSize(11)
            .fillColor("#1a365d")
            .text(`${section.number}. ${section.header}`, ml, doc.y, {
              width: contentWidth,
            });
          doc.moveDown(0.3);

          for (const sub of section.subBullets) {
            const subX = ml + 25;
            const subWidth = contentWidth - 25;

            doc.font("Helvetica").fontSize(10).fillColor("#000000")
              .text(`${sub.letter}. `, subX, doc.y, { width: subWidth, continued: true });
            renderFormattedPdfText(doc, sub.text, subX, { width: subWidth });
            doc.moveDown(0.15);

            for (const roman of sub.romanItems) {
              const romX = ml + 50;
              const romWidth = contentWidth - 50;

              doc.font("Helvetica").fontSize(10).fillColor("#000000")
                .text(`${roman.numeral}. `, romX, doc.y, { width: romWidth, continued: true });
              renderFormattedPdfText(doc, roman.text, romX, { width: romWidth });
              doc.moveDown(0.1);
            }
          }
          doc.moveDown(0.5);
        }
      } else if (background.length === 0) {
        // Fallback: render as plain paragraphs
        const lines = call.formatted_output.split("\n");
        for (const rawLine of lines) {
          const trimmed = rawLine.trim();
          if (!trimmed) {
            doc.moveDown(0.3);
            continue;
          }
          doc
            .font("Helvetica")
            .fontSize(10)
            .fillColor("#000000")
            .text(trimmed, ml, doc.y, { width: contentWidth });
          doc.moveDown(0.1);
        }
      }
    });

    // ---- ADD PAGE NUMBERS TO ALL PAGES (except title page) ----
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 1; i < totalPages; i++) {
      doc.switchToPage(i);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#94a3b8")
        .text(String(i + 1), ml, doc.page.height - 40, {
          width: contentWidth,
          align: "center",
        });
    }

    // ---- ADD PAGE NUMBERS TO TOC ENTRIES ----
    doc.switchToPage(1); // TOC page
    calls.forEach((_call, i) => {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#94a3b8")
        .text(
          String(callPageNumbers[i]),
          pageWidth - mr - 30,
          tocYPositions[i],
          {
            width: 30,
            align: "right",
          }
        );
    });

    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.end();
    });

    return new Response(pdfBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${(() => {
          const now = new Date();
          const d = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
          return `${d} - ${title} - ${subtitle}`.replace(
            /[/\\?%*:|"<>]/g,
            ""
          );
        })()}.pdf"`,
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
