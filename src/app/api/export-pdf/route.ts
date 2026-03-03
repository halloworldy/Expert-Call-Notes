import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";

export const runtime = "nodejs";

interface CallData {
  expert_name: string;
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

function stripMarkdown(text: string): string {
  return text
    .replace(/\*{1,2}/g, "")
    .replace(/_{1,2}/g, "")
    .trim();
}

function parseFormattedOutput(text: string): Section[] {
  const sections: Section[] = [];
  const lines = text.split("\n");

  let currentSection: Section | null = null;
  let currentSubBullet: SubBullet | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const cleanLine = stripMarkdown(line);

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

    if (currentSubBullet) {
      currentSubBullet.text += " " + cleanLine;
    } else if (currentSection) {
      currentSection.header += " " + cleanLine;
    }
  }

  if (currentSubBullet && currentSection) {
    currentSection.subBullets.push(currentSubBullet);
  }
  if (currentSection) sections.push(currentSection);

  return sections;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
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

    // Render TOC entries and track Y positions for page numbers
    const tocYPositions: number[] = [];

    calls.forEach((call, i) => {
      tocYPositions.push(doc.y);
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#1a365d")
        .text(`${i + 1}. `, ml, doc.y, { continued: true, goTo: `call-${i}` });
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#1a365d")
        .text(call.expert_name, { continued: true, goTo: `call-${i}` });
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#94a3b8")
        .text(`   ${formatDate(call.call_date)}`, { goTo: `call-${i}` });
      doc.moveDown(0.4);
    });

    // ---- CALL SECTIONS ----
    const callPageNumbers: number[] = [];

    calls.forEach((call, i) => {
      doc.addPage();
      const range = doc.bufferedPageRange();
      callPageNumbers.push(range.count); // 1-indexed page number
      doc.addNamedDestination(`call-${i}`);

      // Call header
      doc
        .font("Helvetica-Bold")
        .fontSize(17)
        .fillColor("#1a365d")
        .text(call.expert_name, ml, doc.y, { width: contentWidth });

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
      const sections = parseFormattedOutput(call.formatted_output);

      if (sections.length > 0) {
        for (const section of sections) {
          // Section header
          doc
            .font("Helvetica-Bold")
            .fontSize(11)
            .fillColor("#1a365d")
            .text(`${section.number}. ${section.header}`, ml, doc.y, {
              width: contentWidth,
            });
          doc.moveDown(0.3);

          // Sub-bullets - no bold, no italic, all black
          for (const sub of section.subBullets) {
            const subX = ml + 25;
            const subWidth = contentWidth - 25;

            doc
              .font("Helvetica")
              .fontSize(10)
              .fillColor("#000000")
              .text(`${sub.letter}. ${sub.text}`, subX, doc.y, {
                width: subWidth,
              });
            doc.moveDown(0.15);

            // Roman numerals - no italic, black
            for (const roman of sub.romanItems) {
              const romX = ml + 50;
              const romWidth = contentWidth - 50;

              doc
                .font("Helvetica")
                .fontSize(10)
                .fillColor("#000000")
                .text(`${roman.numeral}. ${roman.text}`, romX, doc.y, {
                  width: romWidth,
                });
              doc.moveDown(0.1);
            }
          }
          doc.moveDown(0.5);
        }
      } else {
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
        .text(String(callPageNumbers[i]), pageWidth - mr - 30, tocYPositions[i], {
          width: 30,
          align: "right",
        });
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
          return `${d} - ${title} - ${subtitle}`.replace(/[/\\?%*:|"<>]/g, "");
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
