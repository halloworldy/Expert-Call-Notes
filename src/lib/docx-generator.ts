import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  TableOfContents,
  PageBreak,
  Footer,
  PageNumber,
} from "docx";
import type { Project, ExpertCall } from "@/lib/types";

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
  return text.replace(/\*{1,2}/g, "").replace(/_{1,2}/g, "").replace(/<\/?u>/g, "").trim();
}

// Parse inline formatting markers and return TextRun elements
function parseInlineFormatting(
  text: string,
  baseOptions: { size: number; font: string; color: string; bold?: boolean; italics?: boolean }
): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /(\*\*(.+?)\*\*)|(_(.+?)_)|(<u>(.+?)<\/u>)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index), ...baseOptions }));
    }
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], ...baseOptions, bold: true }));
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4], ...baseOptions, italics: true }));
    } else if (match[6]) {
      runs.push(new TextRun({ text: match[6], ...baseOptions, underline: { type: "single" } }));
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex), ...baseOptions }));
  }

  return runs.length > 0 ? runs : [new TextRun({ text, ...baseOptions })];
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

    const trimmedLine = line.trim(); // preserves formatting markers
    const cleanLine = stripMarkdown(line);

    // Detect section headers
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

    // Background section parsing
    if (inBackground) {
      const bgBulletMatch = cleanLine.match(/^\*\s+(.+)$/);
      if (bgBulletMatch) {
        if (currentBgBullet) background.push(currentBgBullet);
        // Extract raw text preserving inline formatting markers
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
      // Continuation line
      if (currentBgBullet) {
        currentBgBullet.text += " " + trimmedLine;
      }
      continue;
    }

    // Summary / main section parsing
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
      // Use cleanLine match for header text — headers are bold by style, not markers
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
      const rawRomanText = trimmedLine.replace(/^\s*(i{1,3}|iv|vi{0,3}|ix|x{0,3})[.)]\s+/, "");
      currentSubBullet.romanItems.push({
        numeral: romanMatch[1],
        text: rawRomanText,
      });
      continue;
    }

    const subBulletMatch = cleanLine.match(/^\s*([a-z])[.)]\s+(.+)$/);
    if (subBulletMatch && currentSection) {
      if (currentSubBullet) {
        currentSection.subBullets.push(currentSubBullet);
      }
      const rawSubText = trimmedLine.replace(/^\s*[a-z][.)]\s+/, "");
      currentSubBullet = {
        letter: subBulletMatch[1],
        text: rawSubText,
        romanItems: [],
      };
      continue;
    }

    if (currentSubBullet) {
      currentSubBullet.text += " " + trimmedLine;
    } else if (currentSection) {
      currentSection.header += " " + trimmedLine;
    }
  }

  if (currentBgBullet) background.push(currentBgBullet);
  if (currentSubBullet && currentSection) {
    currentSection.subBullets.push(currentSubBullet);
  }
  if (currentSection) sections.push(currentSection);

  return { background, sections };
}

function formatCallDate(dateStr: string): string {
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
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function renderFallbackParagraphs(text: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = text.split("\n");

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      paragraphs.push(
        new Paragraph({ spacing: { before: 40, after: 40 }, children: [] })
      );
      continue;
    }

    const cleanText = trimmed
      .replace(/^#{1,6}\s+/, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/^[-*]\s+/, "");

    const isHeader = /^#{1,6}\s/.test(trimmed) || /^\d+\.\s/.test(trimmed);

    paragraphs.push(
      new Paragraph({
        spacing: {
          before: isHeader ? 120 : 20,
          after: isHeader ? 60 : 20,
        },
        indent: /^\s*(i{1,3}|iv|vi{0,3}|ix|x{0,3})[.)]\s/.test(trimmed)
          ? { left: 576 }
          : /^\s*[a-z][.)]\s/.test(trimmed)
            ? { left: 360 }
            : undefined,
        children: [
          new TextRun({
            text: cleanText,
            bold: isHeader,
            size: isHeader ? 21 : 21,
            font: "Segoe UI",
            color: isHeader ? "0f172a" : "000000",
          }),
        ],
      })
    );
  }

  return paragraphs;
}

export async function generateDocx(
  project: Project,
  calls: ExpertCall[],
  exportTitle?: string,
  exportSubtitle?: string
): Promise<Blob> {
  const title = exportTitle || project.name;
  const subtitle = exportSubtitle || "Expert Call Diligence Report";
  const formattedCalls = calls.filter((c) => c.formatted_output);
  const children: (Paragraph | TableOfContents)[] = [];

  // ---- TITLE PAGE ----
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 3000 },
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: 52,  // 26pt matches preview 26px
          font: "Segoe UI",
          color: "1a365d",
        }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: [
        new TextRun({
          text: subtitle,
          size: 28,  // 14pt matches preview 14px
          font: "Segoe UI",
          color: "64748b",
        }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160 },
      children: [
        new TextRun({
          text: new Date().toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          }),
          size: 24,  // 12pt matches preview 12px
          font: "Segoe UI",
          color: "94a3b8",
        }),
      ],
    })
  );

  // Page break after title
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- TABLE OF CONTENTS PAGE ----
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      border: { bottom: { style: "single" as const, size: 6, color: "2d5899" } },
      children: [
        new TextRun({
          text: "Table of Contents",
          bold: true,
          size: 32,  // 16pt matches preview 16px
          font: "Segoe UI",
          color: "1a365d",
        }),
      ],
    })
  );

  // Word built-in TOC field
  children.push(
    new TableOfContents("Table of Contents", {
      hyperlink: true,
      headingStyleRange: "1-1",
    })
  );

  // ---- EACH EXPERT CALL ----
  formattedCalls.forEach((call) => {
    // Page break before each call
    children.push(new Paragraph({ children: [new PageBreak()] }));

    // Call header - uses HeadingLevel.HEADING_1 so TOC picks it up
    // Preview: 18px bold, color #1a365d, border-bottom 2px #2d5899
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 40 },
        border: { bottom: { style: "single" as const, size: 6, color: "2d5899" } },
        children: [
          new TextRun({
            text: call.expert_name,
            bold: true,
            size: 36,  // 18pt matches preview 18px
            font: "Segoe UI",
            color: "1a365d",
          }),
        ],
      })
    );

    // Position line (preview: 11px, color #475569)
    if (call.position) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: call.position,
              size: 22,  // 11pt matches preview 11px
              font: "Segoe UI",
              color: "475569",
            }),
          ],
        })
      );
    }

    // Call date (preview: 11px italic, color #94a3b8, marginBottom 20px)
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: formatCallDate(call.call_date),
            size: 22,  // 11pt matches preview 11px
            font: "Segoe UI",
            color: "94a3b8",
            italics: true,
          }),
        ],
      })
    );

    // Parse and render formatted content
    const { background, sections } = parseFormattedOutput(
      call.formatted_output!
    );

    // Render background section
    // Preview: "Background" is text-sm font-bold text-slate-800 with border-b
    if (background.length > 0) {
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 60 },
          border: { bottom: { style: "single" as const, size: 1, color: "e2e8f0" } },
          children: [
            new TextRun({
              text: "Background",
              bold: true,
              size: 21,
              font: "Segoe UI",
              color: "1e293b",
            }),
          ],
        })
      );

      for (const bullet of background) {
        // Preview: ml-4 (16px ≈ 240 twips), my-0.5, text-sm text-black
        const bulletBase = { size: 21, font: "Segoe UI", color: "000000" as string };
        children.push(
          new Paragraph({
            spacing: { before: 20, after: 20 },
            indent: { left: 240 },
            children: [
              new TextRun({ text: "\u2022 ", ...bulletBase }),
              ...parseInlineFormatting(bullet.text, bulletBase),
            ],
          })
        );
        for (const sub of bullet.subItems) {
          // Preview: ml-10 (40px ≈ 600 twips)
          children.push(
            new Paragraph({
              spacing: { before: 20, after: 20 },
              indent: { left: 600 },
              children: [
                new TextRun({ text: "o ", ...bulletBase }),
                ...parseInlineFormatting(sub, bulletBase),
              ],
            })
          );
        }
      }
    }

    // Render summary sections
    if (sections.length > 0) {
      if (background.length > 0) {
        // Preview: "Summary" same style as "Background" label
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 60 },
            border: { bottom: { style: "single" as const, size: 1, color: "e2e8f0" } },
            children: [
              new TextRun({
                text: "Summary",
                bold: true,
                size: 21,
                font: "Segoe UI",
                color: "1e293b",
              }),
            ],
          })
        );
      }

      for (const section of sections) {
        // Preview: mt-3 mb-1.5 font-bold text-slate-900 text-sm
        // header text is already clean (from cleanLine match)
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 40 },
            children: [
              new TextRun({
                text: `${section.number}. ${section.header}`,
                bold: true,
                size: 21,
                font: "Segoe UI",
                color: "0f172a",
              }),
            ],
          })
        );

        // Preview: ml-6 (24px ≈ 360 twips), my-0.5, text-sm text-black
        const subBase = { size: 21, font: "Segoe UI", color: "000000" as string };
        for (const sub of section.subBullets) {
          children.push(
            new Paragraph({
              spacing: { before: 20, after: 20 },
              indent: { left: 360 },
              children: [
                new TextRun({ text: `${sub.letter}. `, ...subBase }),
                ...parseInlineFormatting(sub.text, subBase),
              ],
            })
          );

          for (const roman of sub.romanItems) {
            // Preview: ml-12 (48px ≈ 576 twips)
            children.push(
              new Paragraph({
                spacing: { before: 20, after: 20 },
                indent: { left: 576 },
                children: [
                  new TextRun({ text: `${roman.numeral}. `, ...subBase }),
                  ...parseInlineFormatting(roman.text, subBase),
                ],
              })
            );
          }
        }
      }
    } else if (background.length === 0) {
      const fallback = renderFallbackParagraphs(call.formatted_output!);
      for (const p of fallback) {
        children.push(p);
      }
    }
  });

  const doc = new Document({
    features: {
      updateFields: true,
    },
    styles: {
      default: {
        document: {
          run: {
            font: "Segoe UI",
            size: 21,
            color: "000000",
          },
        },
        heading1: {
          run: {
            font: "Segoe UI",
            size: 36,
            bold: true,
            color: "1a365d",
          },
          paragraph: {
            spacing: { before: 0, after: 40 },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: "Segoe UI",
                    size: 18,
                    color: "94a3b8",
                  }),
                ],
              }),
            ],
          }),
          first: new Footer({
            children: [],
          }),
        },
        children,
      },
    ],
  });

  return await Packer.toBlob(doc);
}
