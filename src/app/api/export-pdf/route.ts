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
    const { projectName, calls } = (await request.json()) as {
      projectName: string;
      calls: CallData[];
    };

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
      info: {
        Title: `${projectName} - Diligence Report`,
        Author: "Expert Call Notes",
      },
      autoFirstPage: true,
    });

    const chunks: Uint8Array[] = [];
    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));

    const pageWidth = 595.28;
    const ml = 60;
    const mr = 60;
    const contentWidth = pageWidth - ml - mr;

    // ---- TITLE PAGE ----
    doc.moveDown(10);
    doc
      .font("Helvetica-Bold")
      .fontSize(28)
      .fillColor("#1a365d")
      .text(projectName, ml, doc.y, { width: contentWidth, align: "center" });
    doc.moveDown(0.8);
    doc
      .font("Helvetica")
      .fontSize(14)
      .fillColor("#64748b")
      .text("Expert Call Diligence Report", ml, doc.y, {
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

    // ---- TABLE OF CONTENTS ----
    doc.addPage();
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#1a365d")
      .text("Table of Contents", ml, doc.y, { width: contentWidth });
    doc.moveDown(0.3);

    // Thin rule under heading
    doc
      .moveTo(ml, doc.y)
      .lineTo(pageWidth - mr, doc.y)
      .strokeColor("#e2e8f0")
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(0.8);

    calls.forEach((call, i) => {
      const tocY = doc.y;
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#1a365d")
        .text(`${i + 1}. `, ml, tocY, { continued: true, goTo: `call-${i}` });
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#1a365d")
        .text(call.expert_name, { continued: true, goTo: `call-${i}` });
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#94a3b8")
        .text(`   ${formatDate(call.call_date)}`, { goTo: `call-${i}` });
      doc.moveDown(0.4);
    });

    // ---- CALL SECTIONS ----
    calls.forEach((call, i) => {
      doc.addPage();
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

          // Sub-bullets
          for (const sub of section.subBullets) {
            const subX = ml + 25;
            const subWidth = contentWidth - 25;

            // Render letter bold then text regular on same line
            doc
              .font("Helvetica-Bold")
              .fontSize(10)
              .fillColor("#0f172a")
              .text(`${sub.letter}. `, subX, doc.y, {
                continued: true,
                width: subWidth,
              });
            doc
              .font("Helvetica")
              .fontSize(10)
              .fillColor("#0f172a")
              .text(sub.text, { width: subWidth });
            doc.moveDown(0.15);

            // Roman numerals
            for (const roman of sub.romanItems) {
              const romX = ml + 50;
              const romWidth = contentWidth - 50;

              doc
                .font("Helvetica-Oblique")
                .fontSize(10)
                .fillColor("#64748b")
                .text(`${roman.numeral}. `, romX, doc.y, {
                  continued: true,
                  width: romWidth,
                });
              doc
                .font("Helvetica")
                .fontSize(10)
                .fillColor("#334155")
                .text(roman.text, { width: romWidth });
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
            .fillColor("#0f172a")
            .text(trimmed, ml, doc.y, { width: contentWidth });
          doc.moveDown(0.1);
        }
      }
    });

    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.end();
    });

    return new Response(pdfBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${projectName.replace(/\s+/g, "_")}_Diligence.pdf"`,
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
