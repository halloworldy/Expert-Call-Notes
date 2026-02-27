import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  TableOfContents,
  PageBreak,
  TabStopPosition,
  TabStopType,
  LevelFormat,
} from "docx";
import type { Project, ExpertCall } from "@/lib/types";

/**
 * Parse formatted output text into structured sections.
 * Expected format from Claude:
 *   1. **Header with bold takeaway**
 *      a. Sub-bullet text
 *         i. Roman numeral detail
 *         ii. Another detail
 *      b. Another sub-bullet
 *   2. **Next section header**
 */
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

function parseFormattedOutput(text: string): Section[] {
  const sections: Section[] = [];
  const lines = text.split("\n");

  let currentSection: Section | null = null;
  let currentSubBullet: SubBullet | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    // Match numbered headers: "1. " or "1. **text**"
    const headerMatch = line.match(
      /^\s*(\d+)\.\s+\*{0,2}(.+?)\*{0,2}\s*$/
    );
    if (headerMatch) {
      if (currentSubBullet && currentSection) {
        currentSection.subBullets.push(currentSubBullet);
        currentSubBullet = null;
      }
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        number: headerMatch[1],
        header: headerMatch[2].replace(/\*{1,2}/g, "").trim(),
        subBullets: [],
      };
      continue;
    }

    // Match lettered sub-bullets: "a. " or "   a. " or "a) "
    const subBulletMatch = line.match(
      /^\s*([a-z])[.)]\s+(.+)$/
    );
    if (subBulletMatch && currentSection) {
      if (currentSubBullet) {
        currentSection.subBullets.push(currentSubBullet);
      }
      currentSubBullet = {
        letter: subBulletMatch[1],
        text: subBulletMatch[2].replace(/\*{1,2}/g, "").trim(),
        romanItems: [],
      };
      continue;
    }

    // Match roman numeral sub-levels: "i. " or "   i. " or "i) "
    const romanMatch = line.match(
      /^\s*(i{1,3}|iv|vi{0,3}|ix|x{0,3})[.)]\s+(.+)$/
    );
    if (romanMatch && currentSubBullet) {
      currentSubBullet.romanItems.push({
        numeral: romanMatch[1],
        text: romanMatch[2].replace(/\*{1,2}/g, "").trim(),
      });
      continue;
    }

    // If none match but we have a current sub-bullet, append to its text
    if (currentSubBullet) {
      currentSubBullet.text += " " + line.trim().replace(/\*{1,2}/g, "");
    } else if (currentSection) {
      // Append to section header if no sub-bullet context
      currentSection.header += " " + line.trim().replace(/\*{1,2}/g, "");
    }
  }

  // Push remaining items
  if (currentSubBullet && currentSection) {
    currentSection.subBullets.push(currentSubBullet);
  }
  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

function formatCallDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export async function generateDocx(
  project: Project,
  calls: ExpertCall[]
): Promise<Blob> {
  const formattedCalls = calls.filter((c) => c.formatted_output);

  // Build document sections
  const children: Paragraph[] = [];

  // ---- TITLE PAGE ----
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 3000 },
      children: [
        new TextRun({
          text: project.name,
          bold: true,
          size: 48,
          font: "Calibri",
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
          text: "Expert Call Diligence Report",
          size: 28,
          font: "Calibri",
          color: "4a5568",
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
          font: "Calibri",
          color: "718096",
        }),
      ],
    })
  );

  // Page break after title
  children.push(
    new Paragraph({
      children: [new PageBreak()],
    })
  );

  // ---- CONTENTS PAGE ----
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: "Contents",
          bold: true,
          size: 32,
          font: "Calibri",
          color: "1a365d",
        }),
      ],
    })
  );

  formattedCalls.forEach((call, index) => {
    children.push(
      new Paragraph({
        spacing: { before: 100, after: 100 },
        tabStops: [
          {
            type: TabStopType.RIGHT,
            position: TabStopPosition.MAX,
          },
        ],
        children: [
          new TextRun({
            text: `${index + 1}. `,
            size: 22,
            font: "Calibri",
          }),
          new TextRun({
            text: call.expert_name,
            bold: true,
            size: 22,
            font: "Calibri",
          }),
          new TextRun({
            text: ` (${formatCallDate(call.call_date)})`,
            size: 22,
            font: "Calibri",
            color: "666666",
          }),
        ],
      })
    );
  });

  // ---- EACH EXPERT CALL ----
  formattedCalls.forEach((call) => {
    // Page break before each call
    children.push(
      new Paragraph({
        children: [new PageBreak()],
      })
    );

    // Call header
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 100 },
        border: {
          bottom: {
            color: "2b6cb0",
            space: 4,
            size: 12,
            style: "single" as const,
          },
        },
        children: [
          new TextRun({
            text: `${call.expert_name}`,
            bold: true,
            size: 30,
            font: "Calibri",
            color: "1a365d",
          }),
        ],
      })
    );
    children.push(
      new Paragraph({
        spacing: { after: 300 },
        children: [
          new TextRun({
            text: formatCallDate(call.call_date),
            size: 20,
            font: "Calibri",
            color: "718096",
            italics: true,
          }),
        ],
      })
    );

    // Parse and render sections
    const sections = parseFormattedOutput(call.formatted_output!);

    sections.forEach((section) => {
      // Numbered section header with bold takeaway
      children.push(
        new Paragraph({
          spacing: { before: 300, after: 150 },
          children: [
            new TextRun({
              text: `${section.number}. ${section.header}`,
              bold: true,
              size: 24,
              font: "Calibri",
              color: "1a365d",
            }),
          ],
        })
      );

      // Lettered sub-bullets
      section.subBullets.forEach((sub) => {
        children.push(
          new Paragraph({
            spacing: { before: 80, after: 80 },
            indent: { left: 720 }, // 0.5 inch
            children: [
              new TextRun({
                text: `${sub.letter}. `,
                bold: true,
                size: 22,
                font: "Calibri",
              }),
              new TextRun({
                text: sub.text,
                size: 22,
                font: "Calibri",
              }),
            ],
          })
        );

        // Roman numeral sub-levels
        sub.romanItems.forEach((roman) => {
          children.push(
            new Paragraph({
              spacing: { before: 40, after: 40 },
              indent: { left: 1440 }, // 1 inch
              children: [
                new TextRun({
                  text: `${roman.numeral}. `,
                  italics: true,
                  size: 22,
                  font: "Calibri",
                  color: "4a5568",
                }),
                new TextRun({
                  text: roman.text,
                  size: 22,
                  font: "Calibri",
                }),
              ],
            })
          );
        });
      });
    });
  });

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "numbered-sections",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children,
      },
    ],
  });

  return await Packer.toBlob(doc);
}
