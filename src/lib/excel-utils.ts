/**
 * Excel utility functions for reading tracker metadata in the browser.
 * Uses the xlsx library for parsing.
 */

export interface SheetSummary {
  name: string;
  expertCount: number;
}

export interface TrackerMetadata {
  sheetSummary: SheetSummary[];
  lastUpdated: string | null;
}

/**
 * Parse an Excel file buffer and extract tracker metadata.
 * Returns sheet names with expert counts and the last updated date.
 */
export async function parseTrackerMetadata(
  buffer: ArrayBuffer
): Promise<TrackerMetadata> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });

  const sheetSummary: SheetSummary[] = [];
  let lastUpdated: string | null = null;

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;

    // Find header row by looking for "Name" in columns D-G (0-indexed: 3-6)
    let headerRow = -1;
    for (let row = 0; row < 15; row++) {
      for (let col = 3; col <= 6; col++) {
        const cellAddr = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = ws[cellAddr];
        if (
          cell &&
          typeof cell.v === "string" &&
          cell.v.trim().toLowerCase() === "name"
        ) {
          headerRow = row;
          break;
        }
      }
      if (headerRow >= 0) break;
    }

    // Count expert rows (non-empty name cells after header)
    let expertCount = 0;
    if (headerRow >= 0) {
      // Find the Name column
      let nameCol = 4; // default column E (0-indexed)
      for (let col = 3; col <= 6; col++) {
        const cellAddr = XLSX.utils.encode_cell({ r: headerRow, c: col });
        const cell = ws[cellAddr];
        if (
          cell &&
          typeof cell.v === "string" &&
          cell.v.trim().toLowerCase() === "name"
        ) {
          nameCol = col;
          break;
        }
      }

      const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
      for (let row = headerRow + 1; row <= range.e.r; row++) {
        const cellAddr = XLSX.utils.encode_cell({ r: row, c: nameCol });
        const cell = ws[cellAddr];
        if (cell && cell.v && String(cell.v).trim()) {
          expertCount++;
        }
      }
    }

    sheetSummary.push({ name: sheetName, expertCount });

    // Try to find "Last Updated" date from row 2 (0-indexed row 1)
    if (!lastUpdated) {
      for (let col = 15; col < 30; col++) {
        const cellAddr = XLSX.utils.encode_cell({ r: 1, c: col });
        const cell = ws[cellAddr];
        if (
          cell &&
          typeof cell.v === "string" &&
          cell.v.toLowerCase().includes("last updated")
        ) {
          // The date is in the next column
          const dateAddr = XLSX.utils.encode_cell({ r: 1, c: col + 1 });
          const dateCell = ws[dateAddr];
          if (dateCell) {
            if (dateCell.t === "d") {
              lastUpdated = (dateCell.v as Date).toISOString().split("T")[0];
            } else if (dateCell.w) {
              lastUpdated = dateCell.w;
            } else if (dateCell.v) {
              lastUpdated = String(dateCell.v);
            }
          }
          break;
        }
      }
    }
  }

  return { sheetSummary, lastUpdated };
}

/**
 * Search for an expert by name in the tracker Excel buffer.
 * Returns the biography text if found.
 */
export async function lookupExpertBio(
  buffer: ArrayBuffer,
  expertName: string
): Promise<string | null> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const normalised = normaliseName(expertName);

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;

    // Find header row
    let headerRow = -1;
    let nameCol = -1;
    let bioCol = -1;

    for (let row = 0; row < 15; row++) {
      for (let col = 0; col < 30; col++) {
        const cellAddr = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = ws[cellAddr];
        if (!cell || !cell.v) continue;
        const val = String(cell.v).trim().toLowerCase();
        if (val === "name") {
          headerRow = row;
          nameCol = col;
        }
        if (val === "biography" || val === "bio") {
          bioCol = col;
        }
      }
      if (headerRow >= 0) break;
    }

    if (headerRow < 0 || nameCol < 0 || bioCol < 0) continue;

    // Search for the expert
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let row = headerRow + 1; row <= range.e.r; row++) {
      const cellAddr = XLSX.utils.encode_cell({ r: row, c: nameCol });
      const cell = ws[cellAddr];
      if (!cell || !cell.v) continue;

      if (normaliseName(String(cell.v)) === normalised) {
        const bioCellAddr = XLSX.utils.encode_cell({ r: row, c: bioCol });
        const bioCell = ws[bioCellAddr];
        if (bioCell && bioCell.v) {
          return String(bioCell.v).trim();
        }
        return null;
      }
    }
  }

  return null;
}

/**
 * Normalise a name for comparison: strip whitespace, lowercase, remove accents.
 */
export function normaliseName(name: string): string {
  if (!name) return "";
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
