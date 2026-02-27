import { NextResponse } from "next/server";

interface CallData {
  expert_name: string;
  call_date: string;
  formatted_output: string;
}

export async function POST(request: Request) {
  try {
    const { projectName, calls } = (await request.json()) as {
      projectName: string;
      calls: CallData[];
    };

    // Build HTML document for PDF conversion
    const contentsHtml = calls
      .map(
        (call: CallData, i: number) =>
          `<li style="margin-bottom:4px;"><strong>${call.expert_name}</strong> &ndash; ${new Date(call.call_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</li>`
      )
      .join("\n");

    const callsHtml = calls
      .map(
        (call: CallData) => `
        <div style="page-break-before: always;">
          <h2 style="color:#1a365d; border-bottom: 2px solid #2b6cb0; padding-bottom: 8px; margin-bottom: 16px;">
            ${call.expert_name} &ndash; ${new Date(call.call_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </h2>
          <div style="white-space:pre-wrap; font-size:11pt; line-height:1.6;">
${escapeHtml(call.formatted_output)}
          </div>
        </div>`
      )
      .join("\n");

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Calibri, Arial, sans-serif; margin: 40px; color: #222; }
    h1 { color: #1a365d; font-size: 22pt; margin-bottom: 8px; }
    h2 { color: #1a365d; font-size: 16pt; }
    h3 { color: #2b6cb0; font-size: 13pt; margin-top: 24px; }
    ul { padding-left: 20px; }
    li { margin-bottom: 4px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(projectName)}</h1>
  <p style="color:#666; font-size:10pt;">Expert Call Diligence Report</p>

  <h3>Contents</h3>
  <ol>${contentsHtml}</ol>

  ${callsHtml}
</body>
</html>`;

    // Since we cannot use puppeteer in this serverless environment,
    // return the HTML as a downloadable file that can be printed to PDF
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `attachment; filename="${projectName.replace(/\s+/g, "_")}_Diligence.html"`,
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
