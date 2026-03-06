import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const tmpDir = join(tmpdir(), `merge-${randomUUID()}`);

  try {
    await mkdir(tmpDir, { recursive: true });

    const formData = await request.formData();
    const masterFile = formData.get("master") as File | null;
    if (!masterFile) {
      return NextResponse.json(
        { error: "Master tracker file is required" },
        { status: 400 }
      );
    }

    // Write master file to temp
    const masterPath = join(tmpDir, "master.xlsx");
    const masterBuffer = Buffer.from(await masterFile.arrayBuffer());
    await writeFile(masterPath, masterBuffer);

    // Write network files to temp
    const networkArgs: string[] = [];
    for (const network of ["alphasights", "guidepoint", "glg"]) {
      const file = formData.get(network) as File | null;
      if (file) {
        const filePath = join(tmpDir, `${network}.xlsx`);
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        await writeFile(filePath, fileBuffer);
        networkArgs.push(`--${network}`, filePath);
      }
    }

    if (networkArgs.length === 0) {
      return NextResponse.json(
        { error: "At least one network file is required" },
        { status: 400 }
      );
    }

    const outputPath = join(tmpDir, "output.xlsx");
    const scriptPath = join(
      process.cwd(),
      "src",
      "lib",
      "merge.py"
    );

    // Run Python merge script
    const result = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        execFile(
          "python3",
          [scriptPath, masterPath, outputPath, ...networkArgs],
          { timeout: 90_000 },
          (error, stdout, stderr) => {
            if (error) {
              reject(new Error(stderr || error.message));
            } else {
              resolve({ stdout, stderr });
            }
          }
        );
      }
    );

    // Read the output file
    const outputBuffer = await readFile(outputPath);
    const outputBase64 = outputBuffer.toString("base64");

    let changeLog;
    try {
      changeLog = JSON.parse(result.stdout);
    } catch {
      changeLog = { added: [], networkUpdated: [], creditsUpdated: [] };
    }

    // Cleanup temp files
    const cleanupFiles = [
      masterPath,
      outputPath,
      ...["alphasights", "guidepoint", "glg"].map((n) =>
        join(tmpDir, `${n}.xlsx`)
      ),
    ];
    await Promise.allSettled(cleanupFiles.map((f) => unlink(f)));

    return NextResponse.json({
      mergedFileBase64: outputBase64,
      changeLog,
    });
  } catch (error) {
    console.error("Merge error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to merge files",
      },
      { status: 500 }
    );
  }
}
