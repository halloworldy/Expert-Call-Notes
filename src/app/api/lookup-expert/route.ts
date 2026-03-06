import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { projectId, expertName } = await request.json();

    if (!projectId || !expertName) {
      return NextResponse.json(
        { error: "projectId and expertName are required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Fetch the tracker file for this project
    const { data: tracker } = await supabase
      .from("tracker_files")
      .select("file_data")
      .eq("project_id", projectId)
      .single();

    if (!tracker || !tracker.file_data) {
      return NextResponse.json({ biography: null });
    }

    // Decode base64 to buffer
    const buffer = Buffer.from(tracker.file_data, "base64");

    // Use xlsx to search for the expert
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const normalised = normaliseName(expertName);
    let biography: string | null = null;

    for (const sheetName of workbook.SheetNames) {
      if (biography) break;
      const ws = workbook.Sheets[sheetName];
      if (!ws) continue;

      // Find header row and relevant columns
      let headerRow = -1;
      let nameCol = -1;
      let bioCol = -1;

      for (let row = 0; row < 15; row++) {
        for (let col = 0; col < 30; col++) {
          const cellAddr = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = ws[cellAddr];
          if (!cell || !cell.v) continue;
          const val = String(cell.v).trim().toLowerCase();
          if (val === "name" && headerRow < 0) {
            headerRow = row;
            nameCol = col;
          }
          if (
            (val === "biography" || val === "bio") &&
            (headerRow < 0 || row === headerRow)
          ) {
            bioCol = col;
          }
        }
        if (headerRow >= 0 && bioCol >= 0) break;
      }

      if (headerRow < 0 || nameCol < 0 || bioCol < 0) continue;

      const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
      for (let row = headerRow + 1; row <= range.e.r; row++) {
        const cellAddr = XLSX.utils.encode_cell({ r: row, c: nameCol });
        const cell = ws[cellAddr];
        if (!cell || !cell.v) continue;

        if (normaliseName(String(cell.v)) === normalised) {
          const bioCellAddr = XLSX.utils.encode_cell({ r: row, c: bioCol });
          const bioCell = ws[bioCellAddr];
          if (bioCell && bioCell.v) {
            biography = String(bioCell.v).trim();
          }
          break;
        }
      }
    }

    return NextResponse.json({ biography });
  } catch (error) {
    console.error("Lookup expert error:", error);
    return NextResponse.json(
      { error: "Failed to lookup expert" },
      { status: 500 }
    );
  }
}

function normaliseName(name: string): string {
  if (!name) return "";
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
