import { NextResponse } from "next/server";

interface CallData {
  expert_name: string;
  call_date: string;
  formatted_output: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatOutputToHtml(text: string): string {
  const lines = text.split("\n");
  let html = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      html += "<br/>";
      continue;
    }

    // Escape HTML first, then apply formatting
    let escaped = escapeHtml(line);
    // Convert **bold** to <strong>
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // Remove leftover single asterisks/underscores for italic
    const cleanLine = line.replace(/\*{1,2}/g, "").replace(/_{1,2}/g, "").trim();

    // Numbered header: "1. Header" or "## 1. Header"
    const headerMatch = cleanLine.match(/^(?:#{1,3}\s+)?(\d+)\.\s+(.+)$/);
    if (headerMatch) {
      html += `<h3 style="color:#1a365d; font-size:12pt; font-weight:600; margin:16px 0 8px 0;">${escapeHtml(headerMatch[1])}. ${escapeHtml(headerMatch[2])}</h3>\n`;
      continue;
    }

    // Markdown header without number
    const mdHeaderMatch = cleanLine.match(/^#{1,3}\s+(.+)$/);
    if (mdHeaderMatch) {
      html += `<h3 style="color:#1a365d; font-size:12pt; font-weight:600; margin:16px 0 8px 0;">${escapeHtml(mdHeaderMatch[1])}</h3>\n`;
      continue;
    }

    // Lettered sub-bullet
    const subMatch = cleanLine.match(/^([a-z])[.)]\s+(.+)$/);
    if (subMatch) {
      html += `<p style="margin:4px 0 4px 30px;"><strong>${escapeHtml(subMatch[1])}.</strong> ${escapeHtml(subMatch[2])}</p>\n`;
      continue;
    }

    // Roman numeral
    const romanMatch = cleanLine.match(
      /^(i{1,3}|iv|vi{0,3}|ix|x{0,3})[.)]\s+(.+)$/
    );
    if (romanMatch) {
      html += `<p style="margin:2px 0 2px 60px; color:#64748b;"><em>${escapeHtml(romanMatch[1])}.</em> ${escapeHtml(romanMatch[2])}</p>\n`;
      continue;
    }

    // Bullet point
    const bulletMatch = cleanLine.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      html += `<p style="margin:4px 0 4px 30px;">&bull; ${escapeHtml(bulletMatch[1])}</p>\n`;
      continue;
    }

    // Regular text
    html += `<p style="margin:4px 0;">${escaped}</p>\n`;
  }

  return html;
}

export async function POST(request: Request) {
  try {
    const { projectName, calls } = (await request.json()) as {
      projectName: string;
      calls: CallData[];
    };

    // Build TOC with hyperlinks
    const contentsHtml = calls
      .map(
        (call: CallData, i: number) =>
          `<li style="margin-bottom:8px; list-style:none; padding:6px 0; border-bottom:1px solid #e2e8f0;">
            <a href="#call-${i}" style="color:#1a365d; text-decoration:none; display:flex; justify-content:space-between; align-items:baseline;">
              <span><strong>${escapeHtml(call.expert_name)}</strong></span>
              <span style="color:#64748b; font-size:10pt; margin-left:16px;">${formatDate(call.call_date)}</span>
            </a>
          </li>`
      )
      .join("\n");

    // Build call sections with anchor IDs
    const callsHtml = calls
      .map(
        (call: CallData, i: number) => `
        <div id="call-${i}" style="page-break-before:always;">
          <h2 style="color:#1a365d; border-bottom:2px solid #2d5899; padding-bottom:8px; margin-bottom:4px; font-size:16pt;">
            ${escapeHtml(call.expert_name)}
          </h2>
          <p style="color:#64748b; font-size:10pt; font-style:italic; margin-bottom:20px;">
            ${formatDate(call.call_date)}
          </p>
          <div style="font-size:11pt; line-height:1.7;">
            ${formatOutputToHtml(call.formatted_output)}
          </div>
        </div>`
      )
      .join("\n");

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    body { font-family: 'Inter', Calibri, Arial, sans-serif; margin: 40px 50px; color: #0f172a; line-height: 1.6; }
    h1 { color: #1a365d; font-size: 22pt; margin-bottom: 4px; }
    h2 { color: #1a365d; font-size: 16pt; }
    h3 { color: #1a365d; font-size: 13pt; margin-top: 20px; }
    a { color: #1a365d; }
    @media print {
      a { color: #1a365d !important; text-decoration: none !important; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(projectName)}</h1>
  <p style="color:#64748b; font-size:10pt; margin-bottom:30px;">Expert Call Diligence Report &mdash; ${formatDate(new Date().toISOString())}</p>

  <h3 style="color:#1a365d; border-bottom:1px solid #e2e8f0; padding-bottom:6px;">Contents</h3>
  <ol style="padding-left:0; margin-top:12px;">${contentsHtml}</ol>

  ${callsHtml}
</body>
</html>`;

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
