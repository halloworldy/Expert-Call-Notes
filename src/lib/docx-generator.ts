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
        currentBgBullet = { text: bgBulletMatch[1], subItems: [] };
        continue;
      }
      const bgSubMatch = cleanLine.match(/^\s*o\s+(.+)$/);
      if (bgSubMatch && currentBgBullet) {
        currentBgBullet.subItems.push(bgSubMatch[1]);
        continue;
      }
      // Continuation line
      if (currentBgBullet) {
        currentBgBullet.text += " " + cleanLine;
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
        new Paragraph({ spacing: { before: 80, after: 80 }, children: [] })
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
          before: isHeader ? 200 : 60,
          after: isHeader ? 100 : 60,
        },
        indent: /^\s*(i{1,3}|iv|vi{0,3}|ix|x{0,3})[.)]\s/.test(trimmed)
          ? { left: 1440 }
          : /^\s*[a-z][.)]\s/.test(trimmed)
            ? { left: 720 }
            : undefined,
        children: [
          new TextRun({
            text: cleanText,
            bold: isHeader,
            size: isHeader ? 24 : 22,
            font: "Segoe UI",
            color: isHeader ? "1a365d" : "000000",
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
          size: 52,
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
          size: 28,
          font: "Segoe UI",
          color: "64748b",
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
          text: new Date().toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          }),
          size: 22,
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
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: "Table of Contents",
          bold: true,
          size: 32,
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

    // Build heading text: Name - Position - (DD-Mon-YY)
    let headingText = call.expert_name;
    if (call.position) {
      headingText += ` - ${call.position}`;
    }

    // Call header - uses HeadingLevel.HEADING_1 so TOC picks it up
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: headingText,
            bold: true,
            size: 30,
            font: "Segoe UI",
            color: "1a365d",
          }),
        ],
      })
    );

    // Call date
    children.push(
      new Paragraph({
        spacing: { after: 300 },
        children: [
          new TextRun({
            text: formatCallDate(call.call_date),
            size: 20,
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
    if (background.length > 0) {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 150 },
          children: [
            new TextRun({
              text: "Background",
              bold: true,
              size: 24,
              font: "Segoe UI",
              color: "1a365d",
            }),
          ],
        })
      );

      for (const bullet of background) {
        const bulletBase = { size: 22, font: "Segoe UI", color: "000000" };
        children.push(
          new Paragraph({
            spacing: { before: 80, after: 40 },
            indent: { left: 360 },
            children: [
              new TextRun({ text: "\u2022 ", ...bulletBase }),
              ...parseInlineFormatting(bullet.text, bulletBase),
            ],
          })
        );
        for (const sub of bullet.subItems) {
          children.push(
            new Paragraph({
              spacing: { before: 40, after: 40 },
              indent: { left: 720 },
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
        children.push(
          new Paragraph({
            spacing: { before: 300, after: 150 },
            children: [
              new TextRun({
                text: "Summary",
                bold: true,
                size: 24,
                font: "Segoe UI",
                color: "1a365d",
              }),
            ],
          })
        );
      }

      for (const section of sections) {
        children.push(
          new Paragraph({
            spacing: { before: 300, after: 150 },
            children: [
              new TextRun({
                text: `${section.number}. ${section.header}`,
                bold: true,
                size: 24,
                font: "Segoe UI",
                color: "1a365d",
              }),
            ],
          })
        );

        const subBase = { size: 22, font: "Segoe UI", color: "000000" };
        for (const sub of section.subBullets) {
          children.push(
            new Paragraph({
              spacing: { before: 80, after: 80 },
              indent: { left: 720 },
              children: [
                new TextRun({ text: `${sub.letter}. `, ...subBase }),
                ...parseInlineFormatting(sub.text, subBase),
              ],
            })
          );

          for (const roman of sub.romanItems) {
            children.push(
              new Paragraph({
                spacing: { before: 40, after: 40 },
                indent: { left: 1440 },
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
            size: 22,
            color: "000000",
          },
        },
        heading1: {
          run: {
            font: "Segoe UI",
            size: 30,
            bold: true,
            color: "1a365d",
          },
          paragraph: {
            spacing: { before: 0, after: 200 },
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
