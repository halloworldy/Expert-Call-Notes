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

function stripMarkdown(text: string): string {
  return text.replace(/\*{1,2}/g, "").replace(/_{1,2}/g, "").trim();
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

function formatCallDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
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
        indent: /^\s*[a-z][.)]\s/.test(trimmed)
          ? { left: 720 }
          : /^\s*(i{1,3}|iv|vi{0,3})[.)]\s/.test(trimmed)
            ? { left: 1440 }
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

  // Word built-in TOC field (auto-populated from Heading 1 styles, includes page numbers)
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
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: call.expert_name,
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
    const sections = parseFormattedOutput(call.formatted_output!);

    if (sections.length > 0) {
      for (const section of sections) {
        // Section header
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

        // Sub-bullets
        for (const sub of section.subBullets) {
          children.push(
            new Paragraph({
              spacing: { before: 80, after: 80 },
              indent: { left: 720 },
              children: [
                new TextRun({
                  text: `${sub.letter}. ${sub.text}`,
                  size: 22,
                  font: "Segoe UI",
                  color: "000000",
                }),
              ],
            })
          );

          // Roman numerals
          for (const roman of sub.romanItems) {
            children.push(
              new Paragraph({
                spacing: { before: 40, after: 40 },
                indent: { left: 1440 },
                children: [
                  new TextRun({
                    text: `${roman.numeral}. ${roman.text}`,
                    size: 22,
                    font: "Segoe UI",
                    color: "000000",
                  }),
                ],
              })
            );
          }
        }
      }
    } else {
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
