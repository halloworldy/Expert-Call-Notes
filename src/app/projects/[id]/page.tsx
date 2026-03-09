"use client";

import { useEffect, useState, useCallback, useRef, type DragEvent } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { DEFAULT_PROMPT } from "@/lib/default-prompt";
import type {
  Project,
  ExpertCall,
  SectionDivider,
  ProjectItem,
  TrackerFile,
  MergeLog,
} from "@/lib/types";
import Link from "next/link";

// ---- Inline formatting renderer ----
// Parses **bold**, _italic_, <u>underline</u>, and ![alt](src) image markers within text
function renderInlineFormatting(text: string, key?: string): React.ReactNode {
  if (!text) return null;

  const parts: React.ReactNode[] = [];
  // Pattern matches **bold**, _italic_, <u>underline</u>, or ![alt](src)
  const regex = /(\*\*(.+?)\*\*)|(_(.+?)_)|(<u>(.+?)<\/u>)|(!\[([^\]]*)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match;
  let partKey = 0;

  while ((match = regex.exec(text)) !== null) {
    // Add plain text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // **bold**
      parts.push(<strong key={`${key}-b-${partKey++}`}>{match[2]}</strong>);
    } else if (match[4]) {
      // _italic_
      parts.push(<em key={`${key}-i-${partKey++}`}>{match[4]}</em>);
    } else if (match[6]) {
      // <u>underline</u>
      parts.push(<u key={`${key}-u-${partKey++}`}>{match[6]}</u>);
    } else if (match[9]) {
      // ![alt](src)
      // eslint-disable-next-line @next/next/no-img-element
      parts.push(
        <img
          key={`${key}-img-${partKey++}`}
          src={match[9]}
          alt={match[8] || "image"}
          className="inline-block max-w-full my-1 rounded"
          style={{ maxHeight: 400 }}
        />
      );
    }
    lastIndex = match.index + match[0].length;
  }
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

// ---- Image helpers ----
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function insertImageAtCursor(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (newValue: string) => void,
  dataUrl: string
) {
  const ta = textareaRef.current;
  const pos = ta ? ta.selectionStart : value.length;
  const imageMarkdown = `\n![image](${dataUrl})\n`;
  const newValue = value.slice(0, pos) + imageMarkdown + value.slice(pos);
  onChange(newValue);
  if (ta) {
    setTimeout(() => {
      ta.focus();
      const newPos = pos + imageMarkdown.length;
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  }
}

async function handleImageFiles(
  files: FileList | File[],
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (newValue: string) => void
) {
  for (const file of Array.from(files)) {
    if (!file.type.startsWith("image/")) continue;
    const dataUrl = await fileToBase64(file);
    insertImageAtCursor(textareaRef, value, onChange, dataUrl);
    // Update value reference for subsequent images
    value = textareaRef.current?.value || value;
  }
}

// ---- Formatting toolbar for textareas ----
function FormattingToolbar({ textareaRef, value, onChange }: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  function applyFormat(prefix: string, suffix: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    if (!selected) return;

    // Check if already formatted - if so, remove formatting
    const beforeStart = start - prefix.length;
    const afterEnd = end + suffix.length;
    if (
      beforeStart >= 0 &&
      afterEnd <= value.length &&
      value.slice(beforeStart, start) === prefix &&
      value.slice(end, afterEnd) === suffix
    ) {
      // Remove formatting
      const newValue = value.slice(0, beforeStart) + selected + value.slice(afterEnd);
      onChange(newValue);
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(beforeStart, beforeStart + selected.length);
      }, 0);
      return;
    }

    const newValue = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    onChange(newValue);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  }

  return (
    <div className="flex items-center gap-1 mb-1">
      <button
        type="button"
        onClick={() => applyFormat("**", "**")}
        className="px-2 py-0.5 text-xs font-bold border border-slate-300 rounded hover:bg-slate-100 transition-colors"
        title="Bold (select text first)"
      >
        B
      </button>
      <button
        type="button"
        onClick={() => applyFormat("_", "_")}
        className="px-2 py-0.5 text-xs italic border border-slate-300 rounded hover:bg-slate-100 transition-colors"
        title="Italic (select text first)"
      >
        I
      </button>
      <button
        type="button"
        onClick={() => applyFormat("<u>", "</u>")}
        className="px-2 py-0.5 text-xs underline border border-slate-300 rounded hover:bg-slate-100 transition-colors"
        title="Underline (select text first)"
      >
        U
      </button>
      <button
        type="button"
        onClick={() => imageInputRef.current?.click()}
        className="px-2 py-0.5 text-xs border border-slate-300 rounded hover:bg-slate-100 transition-colors"
        title="Insert image"
      >
        Img
      </button>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          if (e.target.files && e.target.files.length > 0) {
            await handleImageFiles(e.target.files, textareaRef, value, onChange);
            e.target.value = "";
          }
        }}
      />
      <span className="text-[10px] text-slate-400 ml-1">Select text to format, or insert image</span>
    </div>
  );
}

// ---- Image-aware textarea: supports paste and drag/drop of images ----
function ImageTextarea({
  textareaRef,
  value,
  onChange,
  ...props
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "ref">) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={async (e) => {
          const items = e.clipboardData?.items;
          if (!items) return;
          const imageFiles: File[] = [];
          for (const item of Array.from(items)) {
            if (item.type.startsWith("image/")) {
              const file = item.getAsFile();
              if (file) imageFiles.push(file);
            }
          }
          if (imageFiles.length > 0) {
            e.preventDefault();
            await handleImageFiles(imageFiles, textareaRef, value, onChange);
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          setDragOver(false);
          const files = e.dataTransfer?.files;
          if (!files) return;
          const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
          if (imageFiles.length > 0) {
            e.preventDefault();
            await handleImageFiles(imageFiles, textareaRef, value, onChange);
          }
        }}
        {...props}
      />
      {dragOver && (
        <div className="absolute inset-0 border-2 border-dashed border-blue-400 bg-blue-50/50 rounded-lg flex items-center justify-center pointer-events-none">
          <span className="text-sm text-blue-600 font-medium">Drop image here</span>
        </div>
      )}
    </div>
  );
}

// ---- Formatted text renderer ----
function renderFormattedText(text: string) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line) {
      elements.push(<div key={i} className="h-2" />);
      return;
    }

    // Standalone image line: ![alt](src)
    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      elements.push(
        <div key={i} className="my-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageMatch[2]}
            alt={imageMatch[1] || "image"}
            className="max-w-full rounded"
            style={{ maxHeight: 500 }}
          />
        </div>
      );
      return;
    }

    // Strip markers only for pattern matching; render inline formatting for display
    const clean = line.replace(/\*{1,2}/g, "").replace(/_{1,2}/g, "").replace(/<\/?u>/g, "").replace(/!\[[^\]]*\]\([^)]+\)/g, "");

    // Section labels: Background, Summary
    if (clean.match(/^(Background|Summary)\s*$/i)) {
      elements.push(
        <div key={i} className="mt-4 mb-2 font-bold text-slate-800 text-sm border-b border-slate-200 pb-1">
          {clean}
        </div>
      );
      return;
    }

    // Background bullets: "* text"
    const bgBulletMatch = clean.match(/^\*\s+(.+)$/);
    if (bgBulletMatch) {
      // Extract the raw text after "* " for inline formatting
      const rawText = line.replace(/^\*{1,2}\s*\*\s+/, "").replace(/^\*\s+/, "");
      elements.push(
        <div key={i} className="ml-4 my-0.5 text-black text-sm">
          <span className="mr-1">{"\u2022"}</span> {renderInlineFormatting(rawText || bgBulletMatch[1], `l${i}`)}
        </div>
      );
      return;
    }

    // Background sub-bullets: "o text"
    const bgSubMatch = clean.match(/^o\s+(.+)$/);
    if (bgSubMatch) {
      const rawText = line.replace(/^o\s+/, "");
      elements.push(
        <div key={i} className="ml-10 my-0.5 text-black text-sm">
          <span className="mr-1">o</span> {renderInlineFormatting(rawText || bgSubMatch[1], `l${i}`)}
        </div>
      );
      return;
    }

    const headerMatch = clean.match(/^(?:#{1,3}\s+)?(\d+)\.\s+(.+)$/);
    if (headerMatch) {
      elements.push(
        <div
          key={i}
          className="mt-3 mb-1.5 font-bold text-slate-900 text-sm"
        >
          {headerMatch[1]}. {renderInlineFormatting(headerMatch[2], `l${i}`)}
        </div>
      );
      return;
    }
    const mdMatch = clean.match(/^#{1,3}\s+(.+)$/);
    if (mdMatch) {
      elements.push(
        <div
          key={i}
          className="mt-3 mb-1.5 font-bold text-slate-900 text-sm"
        >
          {renderInlineFormatting(mdMatch[1], `l${i}`)}
        </div>
      );
      return;
    }
    const romanMatch = clean.match(
      /^(i{1,3}|iv|vi{0,3}|ix|x{0,3})[.)]\s+(.+)$/
    );
    if (romanMatch) {
      const rawAfterNumeral = line.replace(/^(i{1,3}|iv|vi{0,3}|ix|x{0,3})[.)]\s+/, "");
      elements.push(
        <div key={i} className="ml-12 my-0.5 text-black text-sm">
          {romanMatch[1]}.{" "}
          {renderInlineFormatting(rawAfterNumeral || romanMatch[2], `l${i}`)}
        </div>
      );
      return;
    }
    const subMatch = clean.match(/^([a-z])[.)]\s+(.+)$/);
    if (subMatch) {
      const rawAfterLetter = line.replace(/^[a-z][.)]\s+/, "");
      elements.push(
        <div key={i} className="ml-6 my-0.5 text-black text-sm">
          <span className="font-medium">{subMatch[1]}.</span>{" "}
          {renderInlineFormatting(rawAfterLetter || subMatch[2], `l${i}`)}
        </div>
      );
      return;
    }
    elements.push(
      <div key={i} className="my-0.5 text-black text-sm">
        {renderInlineFormatting(line, `l${i}`)}
      </div>
    );
  });
  return <>{elements}</>;
}

// ---- TOC date formatter (DD-Mon-YY) ----
function formatTocDate(dateStr: string) {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const month = months[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function getItemId(item: ProjectItem): string {
  return item.data.id;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [calls, setCalls] = useState<ExpertCall[]>([]);
  const [dividers, setDividers] = useState<SectionDivider[]>([]);
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  // New call form
  const [showForm, setShowForm] = useState(false);
  const [expertName, setExpertName] = useState("");
  const [callDate, setCallDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [rawNotes, setRawNotes] = useState("");
  const [transcript, setTranscript] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [submitting, setSubmitting] = useState(false);
  const [formatting, setFormatting] = useState<string | null>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState<"notes" | "tracker">("notes");

  // Manual entry form
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualExpertName, setManualExpertName] = useState("");
  const [manualPosition, setManualPosition] = useState("");
  const [manualCallDate, setManualCallDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [manualFormattedNotes, setManualFormattedNotes] = useState("");
  const [submittingManual, setSubmittingManual] = useState(false);
  const manualTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const viewEditTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [showEditPreview, setShowEditPreview] = useState(false);
  const [showManualPreview, setShowManualPreview] = useState(false);

  // Inline view-output editing
  const [viewEditingCallId, setViewEditingCallId] = useState<string | null>(null);
  const [viewEditText, setViewEditText] = useState("");
  const [savingViewEdit, setSavingViewEdit] = useState(false);

  // Tracker
  const [tracker, setTracker] = useState<TrackerFile | null>(null);
  const [uploadingTracker, setUploadingTracker] = useState(false);
  const [networkFiles, setNetworkFiles] = useState<{
    alphasights: File | null;
    guidepoint: File | null;
    glg: File | null;
  }>({ alphasights: null, guidepoint: null, glg: null });
  const [merging, setMerging] = useState(false);
  const [mergeLog, setMergeLog] = useState<MergeLog | null>(null);

  // View / edit
  const [viewingCall, setViewingCall] = useState<ExpertCall | null>(null);
  const [editingCallId, setEditingCallId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    expert_name: "",
    position: "",
    call_date: "",
    raw_notes: "",
    transcript: "",
    formatted_output: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Export
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Drag
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  // Preview
  const [showPreview, setShowPreview] = useState(false);

  // Divider
  const [newDividerLabel, setNewDividerLabel] = useState("");
  const [editingDividerId, setEditingDividerId] = useState<string | null>(null);
  const [editDividerLabel, setEditDividerLabel] = useState("");

  // Export settings (persisted to DB)
  const [exportTitle, setExportTitle] = useState("");
  const [exportSubtitle, setExportSubtitle] = useState("");
  const titleLoadedRef = useRef(false);

  const supabase = createClient();

  const loadProject = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();
    if (data) {
      setProject(data);
      if (data.export_title) setExportTitle(data.export_title);
      if (data.export_subtitle) setExportSubtitle(data.export_subtitle);
      titleLoadedRef.current = true;
    }
  }, [projectId, supabase]);

  const loadCalls = useCallback(async () => {
    // Try sort_order first, fall back to call_date if column doesn't exist
    let result = await supabase
      .from("expert_calls")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true });

    if (result.error) {
      result = await supabase
        .from("expert_calls")
        .select("*")
        .eq("project_id", projectId)
        .order("call_date", { ascending: false });
    }

    if (result.data) setCalls(result.data);
    setLoading(false);
  }, [projectId, supabase]);

  const loadDividers = useCallback(async () => {
    const { data, error } = await supabase
      .from("section_dividers")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true });
    if (!error && data) setDividers(data);
  }, [projectId, supabase]);

  const loadTracker = useCallback(async () => {
    const { data } = await supabase
      .from("tracker_files")
      .select("*")
      .eq("project_id", projectId)
      .single();
    if (data) setTracker(data);
  }, [projectId, supabase]);

  // Merge calls + dividers
  useEffect(() => {
    const merged: ProjectItem[] = [
      ...calls.map((c) => ({ type: "call" as const, data: c })),
      ...dividers.map((d) => ({ type: "divider" as const, data: d })),
    ];
    merged.sort(
      (a, b) => (a.data.sort_order ?? 0) - (b.data.sort_order ?? 0)
    );
    setItems(merged);
  }, [calls, dividers]);

  useEffect(() => {
    loadProject();
    loadCalls();
    loadDividers();
    loadTracker();
  }, [loadProject, loadCalls, loadDividers, loadTracker]);

  // Auto-save export title/subtitle to DB with debounce
  // Skip until initial load completes to avoid overwriting saved values with empty strings
  const titleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!project || !titleLoadedRef.current) return;
    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    titleSaveTimer.current = setTimeout(async () => {
      await supabase
        .from("projects")
        .update({
          export_title: exportTitle || null,
          export_subtitle: exportSubtitle || null,
        })
        .eq("id", projectId);
    }, 800);
    return () => {
      if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    };
  }, [exportTitle, exportSubtitle, project, projectId, supabase]);

  // ---- Create call ----
  async function handleSaveCall(e: React.FormEvent) {
    e.preventDefault();
    if (!expertName.trim() || !rawNotes.trim()) return;
    setSubmitting(true);

    const { data: newCall, error } = await supabase
      .from("expert_calls")
      .insert({
        project_id: projectId,
        expert_name: expertName.trim(),
        position: manualPosition.trim() || null,
        call_date: callDate,
        raw_notes: rawNotes,
        transcript: transcript || null,
        entry_type: "auto-generated",
      })
      .select()
      .single();

    if (error || !newCall) {
      console.error("Failed to save call:", error);
      setSubmitting(false);
      return;
    }

    await supabase
      .from("projects")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", projectId);

    setExpertName("");
    setManualPosition("");
    setCallDate(new Date().toISOString().split("T")[0]);
    setRawNotes("");
    setTranscript("");
    setShowForm(false);
    setSubmitting(false);
    loadCalls();
    loadProject();
  }

  // ---- Format with Claude ----
  async function handleFormat(callId: string) {
    setFormatting(callId);
    const call = calls.find((c) => c.id === callId);
    if (!call) return;

    try {
      // Attempt biography lookup from tracker
      let biography: string | null = null;
      try {
        const nameForLookup = call.expert_name.split(" - ")[0].trim();
        const lookupRes = await fetch("/api/lookup-expert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, expertName: nameForLookup }),
        });
        const lookupData = await lookupRes.json();
        if (lookupData.biography) biography = lookupData.biography;
      } catch {
        // Lookup failed, proceed without biography
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      const response = await fetch("/api/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawNotes: call.raw_notes,
          transcript: call.transcript,
          prompt,
          biography,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const result = await response.json();
      if (result.formatted) {
        await supabase
          .from("expert_calls")
          .update({ formatted_output: result.formatted })
          .eq("id", callId);
        await supabase
          .from("projects")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", projectId);
        loadCalls();
        loadProject();
      } else if (result.error) {
        alert(`Formatting failed: ${result.error}`);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        alert("Formatting timed out after 2 minutes. Try again or use a shorter transcript.");
      }
    }
    setFormatting(null);
  }

  // ---- Save manual entry ----
  async function handleSaveManualEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!manualExpertName.trim() || !manualFormattedNotes.trim()) return;
    setSubmittingManual(true);

    try {
      const { error } = await supabase
        .from("expert_calls")
        .insert({
          project_id: projectId,
          expert_name: manualExpertName.trim(),
          position: manualPosition.trim() || null,
          call_date: manualCallDate,
          raw_notes: "",
          formatted_output: manualFormattedNotes,
          entry_type: "manual",
          sort_order: items.length,
        });

      if (error) {
        console.error("Failed to save manual entry:", error);
        alert(`Failed to save manual entry: ${error.message}`);
        return;
      }

      await supabase
        .from("projects")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", projectId);

      setManualExpertName("");
      setManualPosition("");
      setManualCallDate(new Date().toISOString().split("T")[0]);
      setManualFormattedNotes("");
      setShowManualForm(false);
      loadCalls();
      loadProject();
    } catch (err) {
      console.error("Error saving manual entry:", err);
      alert("An unexpected error occurred while saving.");
    } finally {
      setSubmittingManual(false);
    }
  }

  // ---- Tracker upload ----
  async function handleTrackerUpload(file: File) {
    setUploadingTracker(true);
    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );

      // Parse metadata using xlsx
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetSummary: { name: string; expertCount: number }[] = [];
      let lastUpdated: string | null = null;

      for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        if (!ws) continue;

        let headerRow = -1;
        let nameCol = 4;
        for (let row = 0; row < 15; row++) {
          for (let col = 3; col <= 6; col++) {
            const addr = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = ws[addr];
            if (cell && typeof cell.v === "string" && cell.v.trim().toLowerCase() === "name") {
              headerRow = row;
              nameCol = col;
              break;
            }
          }
          if (headerRow >= 0) break;
        }

        let expertCount = 0;
        if (headerRow >= 0) {
          const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
          for (let row = headerRow + 1; row <= range.e.r; row++) {
            const addr = XLSX.utils.encode_cell({ r: row, c: nameCol });
            const cell = ws[addr];
            if (cell && cell.v && String(cell.v).trim()) expertCount++;
          }
        }
        sheetSummary.push({ name: sheetName, expertCount });

        if (!lastUpdated) {
          for (let col = 15; col < 30; col++) {
            const addr = XLSX.utils.encode_cell({ r: 1, c: col });
            const cell = ws[addr];
            if (cell && typeof cell.v === "string" && cell.v.toLowerCase().includes("last updated")) {
              const dateAddr = XLSX.utils.encode_cell({ r: 1, c: col + 1 });
              const dateCell = ws[dateAddr];
              if (dateCell) {
                lastUpdated = dateCell.w || String(dateCell.v || "");
              }
              break;
            }
          }
        }
      }

      // Upsert to supabase
      const { error } = await supabase
        .from("tracker_files")
        .upsert({
          project_id: projectId,
          filename: file.name,
          file_data: base64,
          sheet_summary: sheetSummary,
          last_updated: lastUpdated,
        }, { onConflict: "project_id" });

      if (error) {
        console.error("Failed to upload tracker:", error);
        alert("Failed to upload tracker. Please run migration-v4.sql first.");
      } else {
        loadTracker();
      }
    } catch (err) {
      console.error("Tracker upload error:", err);
      alert("Failed to parse Excel file");
    }
    setUploadingTracker(false);
  }

  // ---- Tracker download ----
  function handleTrackerDownload() {
    if (!tracker) return;
    const binary = atob(tracker.file_data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const now = new Date();
    const dateStr = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}_${String(now.getDate()).padStart(2, "0")}`;
    const fileName = `${dateStr} - ${project?.name || "Project"} - Expert Tracker.xlsx`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---- Network merge ----
  async function handleMerge() {
    if (!tracker) return;
    const hasFiles = networkFiles.alphasights || networkFiles.guidepoint || networkFiles.glg;
    if (!hasFiles) {
      alert("Please upload at least one network file");
      return;
    }
    setMerging(true);
    setMergeLog(null);

    try {
      // Convert tracker base64 back to File
      const binary = atob(tracker.file_data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const masterBlob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const masterFile = new File([masterBlob], "master.xlsx");

      const formData = new FormData();
      formData.append("master", masterFile);
      if (networkFiles.alphasights) formData.append("alphasights", networkFiles.alphasights);
      if (networkFiles.guidepoint) formData.append("guidepoint", networkFiles.guidepoint);
      if (networkFiles.glg) formData.append("glg", networkFiles.glg);

      const response = await fetch("/api/merge", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (result.error) {
        alert(`Merge failed: ${result.error}`);
      } else {
        // Update tracker with merged file
        const mergedBase64 = result.mergedFileBase64;
        await supabase
          .from("tracker_files")
          .update({
            file_data: mergedBase64,
            last_updated: new Date().toISOString().split("T")[0],
          })
          .eq("project_id", projectId);

        setMergeLog({
          timestamp: new Date().toISOString(),
          networksProcessed: [
            ...(networkFiles.alphasights ? ["AlphaSights"] : []),
            ...(networkFiles.guidepoint ? ["Guidepoint"] : []),
            ...(networkFiles.glg ? ["GLG"] : []),
          ],
          changes: result.changeLog,
        });
        setNetworkFiles({ alphasights: null, guidepoint: null, glg: null });
        loadTracker();
      }
    } catch (err) {
      console.error("Merge error:", err);
      alert("Merge failed. Check that Python 3 and openpyxl are installed.");
    }
    setMerging(false);
  }

  // ---- Edit call ----
  function startEditing(call: ExpertCall) {
    setEditingCallId(call.id);
    setEditForm({
      expert_name: call.expert_name,
      position: call.position || "",
      call_date: call.call_date,
      raw_notes: call.raw_notes,
      transcript: call.transcript || "",
      formatted_output: call.formatted_output || "",
    });
  }

  async function handleSaveEdit() {
    if (!editingCallId) return;
    setSavingEdit(true);
    await supabase
      .from("expert_calls")
      .update({
        expert_name: editForm.expert_name.trim(),
        position: editForm.position.trim() || null,
        call_date: editForm.call_date,
        raw_notes: editForm.raw_notes,
        transcript: editForm.transcript || null,
        formatted_output: editForm.formatted_output || null,
      })
      .eq("id", editingCallId);
    await supabase
      .from("projects")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", projectId);
    setEditingCallId(null);
    setSavingEdit(false);
    loadCalls();
    loadProject();
  }

  // ---- Save view-output inline edit ----
  async function handleSaveViewEdit() {
    if (!viewEditingCallId) return;
    setSavingViewEdit(true);
    try {
      await supabase
        .from("expert_calls")
        .update({ formatted_output: viewEditText || null })
        .eq("id", viewEditingCallId);
      await supabase
        .from("projects")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", projectId);
      setViewEditingCallId(null);
      setViewEditText("");
      loadCalls();
      loadProject();
    } catch (err) {
      console.error("Error saving view edit:", err);
      alert("Failed to save changes.");
    } finally {
      setSavingViewEdit(false);
    }
  }

  // ---- Delete call ----
  async function handleDeleteCall(callId: string) {
    await supabase.from("expert_calls").delete().eq("id", callId);
    loadCalls();
  }

  // ---- Exports ----
  async function handleExportDocx() {
    setExportingDocx(true);
    try {
      const orderedCalls = items
        .filter((it) => it.type === "call")
        .map((it) => it.data as ExpertCall);
      const { generateDocx } = await import("@/lib/docx-generator");
      const blob = await generateDocx(
        project!,
        orderedCalls,
        exportTitle || undefined,
        exportSubtitle || undefined
      );
      const { saveAs } = await import("file-saver");
      const now = new Date();
      const datePrefix = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
      const docTitle = exportTitle || project!.name;
      const docSubtitle = exportSubtitle || "Expert Call Diligence Report";
      const fileName = `${datePrefix} - ${docTitle} - ${docSubtitle}`.replace(/[/\\?%*:|"<>]/g, "");
      saveAs(blob, `${fileName}.docx`);
    } catch (err) {
      console.error("DOCX export failed:", err);
    }
    setExportingDocx(false);
  }

  async function handleExportPdf() {
    setExportingPdf(true);
    try {
      const orderedCalls = items
        .filter((it) => it.type === "call")
        .map((it) => it.data as ExpertCall)
        .filter((c) => c.formatted_output);
      const response = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: project!.name,
          calls: orderedCalls,
          exportTitle: exportTitle || undefined,
          exportSubtitle: exportSubtitle || undefined,
        }),
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const now = new Date();
        const datePrefix = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
        const docTitle = exportTitle || project!.name;
        const docSubtitle = exportSubtitle || "Expert Call Diligence Report";
        const fileName = `${datePrefix} - ${docTitle} - ${docSubtitle}`.replace(/[/\\?%*:|"<>]/g, "");
        a.download = `${fileName}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("PDF export failed:", err);
    }
    setExportingPdf(false);
  }

  // ---- Drag and drop ----
  function handleDragStart(e: DragEvent<HTMLDivElement>, id: string) {
    setDraggedItemId(id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.classList.add("drag-over");
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.currentTarget.classList.remove("drag-over");
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>, targetId: string) {
    e.preventDefault();
    e.currentTarget.classList.remove("drag-over");
    if (!draggedItemId || draggedItemId === targetId) return;

    const newItems = [...items];
    const dragIdx = newItems.findIndex(
      (it) => getItemId(it) === draggedItemId
    );
    const targetIdx = newItems.findIndex(
      (it) => getItemId(it) === targetId
    );
    if (dragIdx === -1 || targetIdx === -1) return;

    const [removed] = newItems.splice(dragIdx, 1);
    newItems.splice(targetIdx, 0, removed);
    setItems(newItems);
    setDraggedItemId(null);
    await saveItemOrder(newItems);
  }

  function handleDragEnd() {
    setDraggedItemId(null);
  }

  async function saveItemOrder(orderedItems: ProjectItem[]) {
    const updates = orderedItems.map((item, index) => {
      if (item.type === "call") {
        return supabase
          .from("expert_calls")
          .update({ sort_order: index })
          .eq("id", item.data.id);
      } else {
        return supabase
          .from("section_dividers")
          .update({ sort_order: index })
          .eq("id", item.data.id);
      }
    });
    await Promise.all(updates);
  }

  // ---- Dividers ----
  async function handleAddDivider() {
    const label = newDividerLabel.trim() || "Section Divider";
    // Normalize all existing sort_orders first, then append new divider
    await saveItemOrder(items);
    const { error } = await supabase.from("section_dividers").insert({
      project_id: projectId,
      label,
      sort_order: items.length,
    });
    if (error) {
      console.error("Failed to add divider:", error);
      alert(
        "Could not add divider. Please run migration-v2.sql in your Supabase SQL Editor first."
      );
      return;
    }
    setNewDividerLabel("");
    await Promise.all([loadDividers(), loadCalls()]);
  }

  async function handleDeleteDivider(id: string) {
    await supabase.from("section_dividers").delete().eq("id", id);
    // Reload both and re-normalize sort orders
    const [dividersResult, callsResult] = await Promise.all([
      supabase
        .from("section_dividers")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("expert_calls")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true }),
    ]);
    const newDividers = dividersResult.data || [];
    const newCalls = callsResult.data || [];
    const merged: ProjectItem[] = [
      ...newCalls.map((c: ExpertCall) => ({ type: "call" as const, data: c })),
      ...newDividers.map((d: SectionDivider) => ({ type: "divider" as const, data: d })),
    ];
    merged.sort((a, b) => (a.data.sort_order ?? 0) - (b.data.sort_order ?? 0));
    // Re-normalize sort orders
    await saveItemOrder(merged);
    setDividers(newDividers);
    setCalls(newCalls);
  }

  async function handleSaveDividerLabel(dividerId: string) {
    const label = editDividerLabel.trim();
    if (!label) {
      setEditingDividerId(null);
      return;
    }
    await supabase
      .from("section_dividers")
      .update({ label })
      .eq("id", dividerId);
    setEditingDividerId(null);
    loadDividers();
  }

  // ---- Helpers ----
  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatDateTime(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const formattedCallCount = calls.filter((c) => c.formatted_output).length;

  // Compute preview stats for the summary header
  const previewFormattedCalls = items.filter(
    (it) => it.type === "call" && (it.data as ExpertCall).formatted_output
  );
  const previewPageCount = 2 + previewFormattedCalls.length; // title + toc + each call
  const previewWordCount = (() => {
    const allText = previewFormattedCalls
      .map((it) => (it.data as ExpertCall).formatted_output!)
      .join(" ");
    return allText.trim() ? allText.trim().split(/\s+/).length : 0;
  })();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
        Loading...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
        Project not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-700">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/projects"
              className="text-slate-400 hover:text-slate-200 text-sm transition-colors"
            >
              Projects
            </Link>
            <span className="text-slate-600">/</span>
            <h1 className="text-sm font-semibold text-white">
              {project.name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportDocx}
              disabled={exportingDocx || formattedCallCount === 0}
              className="px-3 py-1.5 bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-40 text-xs font-medium transition-colors"
            >
              {exportingDocx ? "Generating..." : "Export DOCX"}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf || formattedCallCount === 0}
              className="px-3 py-1.5 bg-slate-600 text-white rounded-md hover:bg-slate-500 disabled:opacity-40 text-xs font-medium transition-colors"
            >
              {exportingPdf ? "Generating..." : "Export PDF"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* Project info */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 mb-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Last updated: {formatDateTime(project.updated_at)}</span>
            <span>
              {calls.length} expert call{calls.length !== 1 ? "s" : ""}
              {formattedCallCount > 0 &&
                ` (${formattedCallCount} formatted)`}
            </span>
          </div>
        </div>

        {/* Document Title & Subtitle */}
        <div className="bg-white rounded-lg border border-slate-200 mb-3 px-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Document Title
              </label>
              <input
                type="text"
                value={exportTitle}
                onChange={(e) => setExportTitle(e.target.value)}
                placeholder={project.name}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Document Subtitle
              </label>
              <input
                type="text"
                value={exportSubtitle}
                onChange={(e) => setExportSubtitle(e.target.value)}
                placeholder="Expert Call Diligence Report"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Document Preview */}
        <details
          className="group bg-white rounded-lg border border-slate-200 mb-5"
          open={showPreview}
          onToggle={(e) => setShowPreview((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between text-sm font-semibold text-slate-800 hover:bg-slate-50 rounded-lg transition-colors">
            <span className="flex items-center gap-3">
              Document Preview
              {previewFormattedCalls.length > 0 && (
                <span className="text-xs font-normal text-slate-400">
                  {previewPageCount} pages &middot; {previewWordCount.toLocaleString()} words
                </span>
              )}
            </span>
            <svg
              className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
        </details>

        {/* Document Preview */}
        {showPreview && (() => {
          // Build page list for numbering: title (p1, no number shown), TOC (p2), then call/divider pages
          const formattedItems = items.filter(
            (it) =>
              it.type === "divider" ||
              (it.type === "call" && (it.data as ExpertCall).formatted_output)
          );
          // Page 1 = title, Page 2 = TOC, Page 3+ = calls/dividers (dividers share page with next call)
          // For simplicity: each call gets its own page, dividers are inline
          let pageCounter = 2; // title=1, toc=2
          const callPageMap = new Map<string, number>();
          for (const it of formattedItems) {
            if (it.type === "call") {
              pageCounter++;
              callPageMap.set(it.data.id, pageCounter);
            }
          }
          const totalPages = pageCounter;

          // Word count across all formatted calls
          const allFormattedText = items
            .filter((it) => it.type === "call" && (it.data as ExpertCall).formatted_output)
            .map((it) => (it.data as ExpertCall).formatted_output!)
            .join(" ");
          const wordCount = allFormattedText.trim() ? allFormattedText.trim().split(/\s+/).length : 0;

          const pageStyle = (mt = 24): React.CSSProperties => ({
            background: "#ffffff",
            borderRadius: 4,
            boxShadow: "0 2px 8px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.08)",
            padding: "48px 56px",
            marginTop: mt,
            position: "relative",
          });

          const pageNumberStyle: React.CSSProperties = {
            position: "absolute",
            bottom: 16,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: 10,
            color: "#94a3b8",
          };

          return (
          <div
            className="rounded-lg mb-5"
            style={{
              background: "#dfe6ee",
              padding: 32,
              fontFamily: "'Segoe UI', Arial, Calibri, sans-serif",
              lineHeight: 1.6,
            }}
          >
            {/* Stats bar */}
            <div style={{
              display: "flex",
              gap: 16,
              marginBottom: 16,
              fontSize: 12,
              color: "#64748b",
              fontWeight: 500,
            }}>
              <span>{totalPages} pages</span>
              <span>{wordCount.toLocaleString()} words</span>
            </div>

            {/* Title Page (p1 - no page number) */}
            <div
              style={{
                ...pageStyle(0),
                padding: "80px 56px",
                textAlign: "center",
                minHeight: 320,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: "#1a365d",
                  marginBottom: 12,
                }}
              >
                {exportTitle || project.name}
              </div>
              <div
                style={{
                  width: 80,
                  borderTop: "2px solid #2d5899",
                  marginBottom: 12,
                }}
              />
              <div style={{ fontSize: 14, color: "#64748b" }}>
                {exportSubtitle || "Expert Call Diligence Report"}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            </div>

            {/* Table of Contents Page (p2) */}
            <div style={pageStyle()}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#1a365d",
                  marginBottom: 4,
                }}
              >
                Table of Contents
              </div>
              <div
                style={{
                  borderTop: "2px solid #2d5899",
                  marginBottom: 20,
                }}
              />
              {(() => {
                let callCounter = 0;
                return formattedItems.map((it) => {
                    if (it.type === "divider") {
                      const div = it.data as SectionDivider;
                      return (
                        <div
                          key={div.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 0 4px 0",
                            marginTop: 8,
                          }}
                        >
                          <div
                            style={{ flex: 1, borderTop: "1px solid #cbd5e1" }}
                          />
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#475569",
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                            }}
                          >
                            {div.label}
                          </span>
                          <div
                            style={{ flex: 1, borderTop: "1px solid #cbd5e1" }}
                          />
                        </div>
                      );
                    }
                    const call = it.data as ExpertCall;
                    callCounter++;
                    const idx = items.indexOf(it);
                    let indented = false;
                    for (let i = idx - 1; i >= 0; i--) {
                      if (items[i].type === "divider") {
                        indented = true;
                        break;
                      }
                    }
                    return (
                      <div
                        key={call.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          padding: "8px 0",
                          paddingLeft: indented ? 20 : 0,
                          borderBottom: "1px solid #eef1f5",
                          fontSize: 13,
                        }}
                      >
                        <span style={{ color: "#0f172a" }}>
                          {callCounter}.{" "}
                          <span style={{ fontWeight: 500 }}>
                            {call.expert_name}
                            {call.position ? ` - ${call.position}` : ""}
                            {` - (${formatTocDate(call.call_date)})`}
                          </span>
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "#94a3b8",
                            marginLeft: 16,
                          }}
                        >
                          {callPageMap.get(call.id)}
                        </span>
                      </div>
                    );
                  });
              })()}
              <div style={pageNumberStyle}>2</div>
            </div>

            {/* Call pages */}
            {(() => {
              let currentPage = 2;
              return items.map((item) => {
              if (item.type === "divider") {
                return (
                  <div
                    key={item.data.id}
                    style={{
                      background: "#ffffff",
                      borderRadius: 4,
                      boxShadow:
                        "0 2px 8px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.08)",
                      padding: "20px 56px",
                      marginTop: 24,
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                    }}
                  >
                    <div
                      style={{ flex: 1, borderTop: "2px solid #cbd5e1" }}
                    />
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {(item.data as SectionDivider).label}
                    </span>
                    <div
                      style={{ flex: 1, borderTop: "2px solid #cbd5e1" }}
                    />
                  </div>
                );
              }
              const call = item.data as ExpertCall;
              if (!call.formatted_output) return null;
              currentPage++;
              return (
                <div
                  key={call.id}
                  style={pageStyle()}
                >
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: "#1a365d",
                      borderBottom: "2px solid #2d5899",
                      paddingBottom: 8,
                      marginBottom: 4,
                    }}
                  >
                    {call.expert_name}
                  </div>
                  {call.position && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#475569",
                        marginBottom: 4,
                      }}
                    >
                      {call.position}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 11,
                      fontStyle: "italic",
                      color: "#94a3b8",
                      marginBottom: 20,
                    }}
                  >
                    {formatDate(call.call_date)}
                  </div>
                  {renderFormattedText(call.formatted_output)}
                  <div style={pageNumberStyle}>{currentPage}</div>
                </div>
              );
            });
            })()}
          </div>
        );
        })()}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 mb-5">
          <button
            onClick={() => setActiveTab("notes")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "notes"
                ? "border-blue-700 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Notes
          </button>
          <button
            onClick={() => setActiveTab("tracker")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "tracker"
                ? "border-blue-700 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Expert Tracker
          </button>
        </div>

        {/* ============ TRACKER TAB ============ */}
        {activeTab === "tracker" && (
          <div className="space-y-5">
            {/* Upload tracker */}
            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Master Tracker</h3>
              {tracker ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm text-slate-700">{tracker.filename}</p>
                      <p className="text-xs text-slate-400">
                        Uploaded: {new Date(tracker.uploaded_at).toLocaleDateString()}
                        {tracker.last_updated && ` \u00b7 Last Updated: ${tracker.last_updated}`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleTrackerDownload}
                        className="px-3 py-1.5 bg-blue-700 text-white rounded-md hover:bg-blue-800 text-xs font-medium"
                      >
                        Download
                      </button>
                      <label className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 text-xs font-medium cursor-pointer">
                        Replace
                        <input
                          type="file"
                          accept=".xlsx"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) handleTrackerUpload(e.target.files[0]);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  {/* Sheet summary */}
                  {tracker.sheet_summary && (
                    <div className="border border-slate-100 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="text-left px-3 py-1.5 font-medium text-slate-600">Sheet</th>
                            <th className="text-right px-3 py-1.5 font-medium text-slate-600">Experts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(tracker.sheet_summary as { name: string; expertCount: number }[]).map((s, i) => (
                            <tr key={i} className="border-t border-slate-50">
                              <td className="px-3 py-1.5 text-slate-700">{s.name}</td>
                              <td className="px-3 py-1.5 text-right text-slate-500">{s.expertCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-lg p-8 cursor-pointer hover:border-blue-400 transition-colors">
                  <span className="text-sm text-slate-500 mb-1">
                    {uploadingTracker ? "Uploading..." : "Drop or click to upload master tracker (.xlsx)"}
                  </span>
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    disabled={uploadingTracker}
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleTrackerUpload(e.target.files[0]);
                    }}
                  />
                </label>
              )}
            </div>

            {/* Network merge */}
            {tracker && (
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Network Export Merge</h3>
                <p className="text-xs text-slate-500 mb-4">Upload network export files to merge into the master tracker</p>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {(["alphasights", "guidepoint", "glg"] as const).map((network) => (
                    <div key={network}>
                      <label className="block text-xs font-medium text-slate-600 mb-1 capitalize">{network === "glg" ? "GLG" : network === "alphasights" ? "AlphaSights" : "Guidepoint"}</label>
                      <label className="flex items-center justify-center border-2 border-dashed border-slate-200 rounded-lg p-4 cursor-pointer hover:border-blue-400 transition-colors text-xs text-slate-500">
                        {networkFiles[network] ? networkFiles[network]!.name : "Choose file"}
                        <input
                          type="file"
                          accept=".xlsx"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              setNetworkFiles({ ...networkFiles, [network]: e.target.files[0] });
                            }
                          }}
                        />
                      </label>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleMerge}
                  disabled={merging || (!networkFiles.alphasights && !networkFiles.guidepoint && !networkFiles.glg)}
                  className="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50 text-sm font-medium"
                >
                  {merging ? "Merging..." : "Merge"}
                </button>

                {/* Merge log */}
                {mergeLog && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <h4 className="text-xs font-semibold text-slate-700 mb-2">
                      Merge Results ({mergeLog.networksProcessed.join(", ")})
                    </h4>
                    {mergeLog.changes.added.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-emerald-700 mb-1">New experts added ({mergeLog.changes.added.length})</p>
                        {mergeLog.changes.added.map((c, i) => (
                          <p key={i} className="text-xs text-slate-600 ml-2">{c.name} \u2192 {c.sheet} ({c.network})</p>
                        ))}
                      </div>
                    )}
                    {mergeLog.changes.networkUpdated.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-blue-700 mb-1">Network columns updated ({mergeLog.changes.networkUpdated.length})</p>
                        {mergeLog.changes.networkUpdated.map((c, i) => (
                          <p key={i} className="text-xs text-slate-600 ml-2">{c.name} \u2192 {c.network} marked ({c.sheet})</p>
                        ))}
                      </div>
                    )}
                    {mergeLog.changes.creditsUpdated.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-amber-700 mb-1">Credits updated ({mergeLog.changes.creditsUpdated.length})</p>
                        {mergeLog.changes.creditsUpdated.map((c, i) => (
                          <p key={i} className="text-xs text-slate-600 ml-2">{c.name}: {c.oldValue} \u2192 {c.newValue} ({c.sheet})</p>
                        ))}
                      </div>
                    )}
                    {mergeLog.changes.added.length === 0 && mergeLog.changes.networkUpdated.length === 0 && mergeLog.changes.creditsUpdated.length === 0 && (
                      <p className="text-xs text-slate-500">No changes were made</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ============ NOTES TAB ============ */}
        {activeTab === "notes" && (<>
        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-5">
          {!showForm && !showManualForm && (
            <>
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm font-medium transition-colors"
              >
                + Add Expert Call
              </button>
              <button
                onClick={() => setShowManualForm(true)}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 text-sm font-medium transition-colors"
              >
                + Add Manual Entry
              </button>
            </>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newDividerLabel}
              onChange={(e) => setNewDividerLabel(e.target.value)}
              placeholder="Divider label (optional)"
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white w-48"
            />
            <button
              onClick={handleAddDivider}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 text-sm font-medium transition-colors"
            >
              + Add Divider
            </button>
          </div>
        </div>

        {/* New call form */}
        {showForm && (
          <div className="bg-white rounded-lg border border-slate-200 p-5 mb-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">
              New Expert Call
            </h3>
            <form onSubmit={handleSaveCall} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Expert Title
                </label>
                <textarea
                  value={expertName}
                  onChange={(e) => setExpertName(e.target.value)}
                  required
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder='e.g., "John Smith - Accenture - Former Managing Director, Financial Services Practice (2015-2022)"'
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Call Date
                  </label>
                  <input
                    type="date"
                    value={callDate}
                    onChange={(e) => setCallDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Position (optional, for TOC)
                  </label>
                  <input
                    type="text"
                    value={manualPosition}
                    onChange={(e) => setManualPosition(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="e.g., CEO Nearshore German-Speaking Markets, TP"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Raw Notes *
                </label>
                <textarea
                  value={rawNotes}
                  onChange={(e) => setRawNotes(e.target.value)}
                  required
                  rows={6}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs input-font"
                  placeholder="Paste your rough notes here..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Transcript (optional)
                </label>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs input-font"
                  placeholder="Paste transcript if available..."
                />
              </div>

              {/* Formatting prompt - editable before saving */}
              <details>
                <summary className="cursor-pointer text-xs text-blue-700 hover:text-blue-800 font-medium">
                  Formatting Prompt (edit before formatting)
                </summary>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={10}
                  className="w-full mt-2 px-3 py-2 border border-slate-200 rounded-lg text-xs input-font"
                />
              </details>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50 text-sm font-medium transition-colors"
                >
                  {submitting ? "Saving..." : "Save Call"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Manual entry form */}
        {showManualForm && (
          <div className="bg-white rounded-lg border border-slate-200 p-5 mb-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">
              New Manual Entry
            </h3>
            <form onSubmit={handleSaveManualEntry} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Expert Name
                  </label>
                  <input
                    type="text"
                    value={manualExpertName}
                    onChange={(e) => setManualExpertName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="Expert name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Position / Title
                  </label>
                  <input
                    type="text"
                    value={manualPosition}
                    onChange={(e) => setManualPosition(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="e.g., CEO Nearshore German-Speaking Markets, TP"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={manualCallDate}
                  onChange={(e) => setManualCallDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm max-w-xs"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-600">
                    Full Formatted Notes *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowManualPreview(!showManualPreview)}
                    className="text-[10px] px-2 py-0.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    {showManualPreview ? "Hide Preview" : "Show Preview"}
                  </button>
                </div>
                <FormattingToolbar
                  textareaRef={manualTextareaRef}
                  value={manualFormattedNotes}
                  onChange={setManualFormattedNotes}
                />
                <div className={showManualPreview ? "grid grid-cols-2 gap-3" : ""}>
                  <ImageTextarea
                    textareaRef={manualTextareaRef}
                    value={manualFormattedNotes}
                    onChange={setManualFormattedNotes}
                    required
                    rows={15}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs input-font"
                    placeholder="Paste your complete formatted notes here..."
                  />
                  {showManualPreview && manualFormattedNotes && (
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 overflow-y-auto max-h-[400px]">
                      <div className="text-[10px] text-slate-400 mb-2 font-medium uppercase tracking-wide">Preview</div>
                      {renderFormattedText(manualFormattedNotes)}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={submittingManual}
                  className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 text-sm font-medium transition-colors"
                >
                  {submittingManual ? "Saving..." : "Save Manual Entry"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Items list */}
        {items.length === 0 && !showForm ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-sm mb-1">No expert calls yet</p>
            <p className="text-xs">
              Add your first expert call to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const itemId = getItemId(item);

              // Check if this call sits under a divider (for indentation)
              const isUnderDivider = (() => {
                const idx = items.indexOf(item);
                for (let i = idx - 1; i >= 0; i--) {
                  if (items[i].type === "divider") return true;
                }
                return false;
              })();

              // ---- Divider ----
              if (item.type === "divider") {
                const div = item.data as SectionDivider;
                return (
                  <div
                    key={div.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, div.id)}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, div.id)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-3 py-2.5 px-4 rounded-lg border border-slate-200 bg-slate-50 group transition-all mt-4 first:mt-0 ${
                      draggedItemId === div.id ? "opacity-40" : ""
                    }`}
                  >
                    <span className="drag-handle text-slate-400 group-hover:text-slate-500 text-sm select-none">
                      &#x2630;
                    </span>
                    <div className="flex-1 border-t-2 border-slate-300" />
                    {editingDividerId === div.id ? (
                      <input
                        type="text"
                        value={editDividerLabel}
                        onChange={(e) => setEditDividerLabel(e.target.value)}
                        onBlur={() => handleSaveDividerLabel(div.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            handleSaveDividerLabel(div.id);
                          if (e.key === "Escape")
                            setEditingDividerId(null);
                        }}
                        autoFocus
                        className="text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded px-2 py-0.5 text-center w-40"
                      />
                    ) : (
                      <span
                        onClick={() => {
                          setEditingDividerId(div.id);
                          setEditDividerLabel(div.label);
                        }}
                        className="text-xs font-semibold text-slate-600 uppercase tracking-widest whitespace-nowrap cursor-pointer hover:text-slate-800"
                        title="Click to rename"
                      >
                        {div.label}
                      </span>
                    )}
                    <div className="flex-1 border-t-2 border-slate-300" />
                    <button
                      onClick={() => handleDeleteDivider(div.id)}
                      className="text-slate-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Remove
                    </button>
                  </div>
                );
              }

              // ---- Call card ----
              const call = item.data as ExpertCall;
              const isEditing = editingCallId === call.id;

              return (
                <div
                  key={call.id}
                  draggable={!isEditing}
                  onDragStart={(e) => handleDragStart(e, call.id)}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, call.id)}
                  onDragEnd={handleDragEnd}
                  className={`bg-white rounded-lg border border-slate-200 transition-all ${
                    draggedItemId === itemId ? "opacity-40" : ""
                  }`}
                  style={isUnderDivider ? { marginLeft: 24 } : undefined}
                >
                  {isEditing ? (
                    /* ---- EDIT MODE ---- */
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-slate-900">
                          Edit Call Entry
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEdit}
                            disabled={savingEdit}
                            className="px-3 py-1.5 bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-50 text-xs font-medium transition-colors"
                          >
                            {savingEdit ? "Saving..." : "Save Changes"}
                          </button>
                          <button
                            onClick={() => setEditingCallId(null)}
                            className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 text-xs font-medium transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Expert Title
                        </label>
                        <textarea
                          value={editForm.expert_name}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              expert_name: e.target.value,
                            })
                          }
                          rows={2}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Position (for TOC)
                          </label>
                          <input
                            type="text"
                            value={editForm.position}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                position: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                            placeholder="Optional"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Call Date
                          </label>
                          <input
                            type="date"
                            value={editForm.call_date}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                call_date: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Raw Notes
                        </label>
                        <textarea
                          value={editForm.raw_notes}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              raw_notes: e.target.value,
                            })
                          }
                          rows={5}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs input-font"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Transcript
                        </label>
                        <textarea
                          value={editForm.transcript}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              transcript: e.target.value,
                            })
                          }
                          rows={3}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs input-font"
                        />
                      </div>
                      {editForm.formatted_output && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-medium text-slate-500">
                              Formatted Output
                            </label>
                            <button
                              type="button"
                              onClick={() => setShowEditPreview(!showEditPreview)}
                              className="text-[10px] px-2 py-0.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                            >
                              {showEditPreview ? "Hide Preview" : "Show Preview"}
                            </button>
                          </div>
                          <FormattingToolbar
                            textareaRef={editTextareaRef}
                            value={editForm.formatted_output}
                            onChange={(val) =>
                              setEditForm({ ...editForm, formatted_output: val })
                            }
                          />
                          <div className={showEditPreview ? "grid grid-cols-2 gap-3" : ""}>
                            <ImageTextarea
                              textareaRef={editTextareaRef}
                              value={editForm.formatted_output}
                              onChange={(val) =>
                                setEditForm({
                                  ...editForm,
                                  formatted_output: val,
                                })
                              }
                              rows={25}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs input-font"
                            />
                            {showEditPreview && editForm.formatted_output && (
                              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 overflow-y-auto max-h-[600px]">
                                <div className="text-[10px] text-slate-400 mb-2 font-medium uppercase tracking-wide">Preview</div>
                                {renderFormattedText(editForm.formatted_output)}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* ---- VIEW MODE ---- */
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-start gap-2">
                          <span className="drag-handle text-slate-300 hover:text-slate-400 mt-0.5 text-sm select-none">
                            &#x2630;
                          </span>
                          <div>
                            <h3 className="text-sm font-medium text-slate-900">
                              {call.expert_name}
                            </h3>
                            {call.position && (
                              <p className="text-xs text-slate-500">{call.position}</p>
                            )}
                            <p className="text-xs text-slate-400">
                              {formatDate(call.call_date)} &middot; Added{" "}
                              {formatDateTime(call.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {call.entry_type === "manual" ? (
                            <span className="px-2 py-0.5 bg-violet-50 text-violet-700 rounded text-xs font-medium">
                              Manual
                            </span>
                          ) : call.formatted_output ? (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs font-medium">
                              Formatted
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-medium">
                              Raw Only
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Notes preview */}
                      <p className="text-xs text-slate-500 line-clamp-2 mb-3 ml-6">
                        {(call.entry_type === "manual" ? call.formatted_output || "" : call.raw_notes).substring(0, 250)}
                        {(call.entry_type === "manual" ? call.formatted_output || "" : call.raw_notes).length > 250 ? "..." : ""}
                      </p>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100 ml-6 flex-wrap">
                        <button
                          onClick={() => startEditing(call)}
                          className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 text-xs font-medium transition-colors"
                        >
                          Edit
                        </button>

                        {!call.formatted_output && call.entry_type !== "manual" && (
                          <button
                            onClick={() => handleFormat(call.id)}
                            disabled={formatting === call.id}
                            className="px-3 py-1.5 bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-50 text-xs font-medium transition-colors whitespace-nowrap"
                          >
                            {formatting === call.id
                              ? "Formatting..."
                              : "Format with Claude"}
                          </button>
                        )}

                        {call.formatted_output && (
                          <>
                            <button
                              onClick={() =>
                                setViewingCall(
                                  viewingCall?.id === call.id ? null : call
                                )
                              }
                              className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 text-xs font-medium transition-colors"
                            >
                              {viewingCall?.id === call.id
                                ? "Hide Output"
                                : "View Output"}
                            </button>
                            {call.entry_type !== "manual" && (
                              <button
                                onClick={() => handleFormat(call.id)}
                                disabled={formatting === call.id}
                                className="px-3 py-1.5 bg-slate-100 text-blue-700 rounded-md hover:bg-blue-50 disabled:opacity-50 text-xs font-medium transition-colors"
                              >
                                {formatting === call.id
                                  ? "Re-formatting..."
                                  : "Re-format"}
                              </button>
                            )}
                          </>
                        )}

                        <button
                          onClick={() => handleDeleteCall(call.id)}
                          className="px-3 py-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md text-xs font-medium transition-colors ml-auto"
                        >
                          Delete
                        </button>
                      </div>

                      {/* Formatting prompt (below actions, hidden for manual entries) */}
                      {call.entry_type !== "manual" && (
                        <div className="ml-6 mt-2">
                          <details>
                            <summary className="cursor-pointer text-xs text-blue-700 hover:text-blue-800 font-medium">
                              Formatting Prompt
                            </summary>
                            <textarea
                              value={prompt}
                              onChange={(e) => setPrompt(e.target.value)}
                              rows={8}
                              className="w-full mt-2 px-3 py-2 border border-slate-200 rounded-lg text-xs input-font"
                            />
                          </details>
                        </div>
                      )}

                      {/* Formatted output view / edit */}
                      {viewingCall?.id === call.id &&
                        call.formatted_output && (
                          <div className="mt-3 p-4 bg-slate-50 rounded-lg border border-slate-100 ml-6">
                            {/* Toggle between view and inline edit */}
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                                {viewEditingCallId === call.id ? "Edit Output" : "Formatted Output"}
                              </span>
                              <div className="flex items-center gap-2">
                                {viewEditingCallId === call.id ? (
                                  <>
                                    <button
                                      onClick={handleSaveViewEdit}
                                      disabled={savingViewEdit}
                                      className="px-3 py-1 bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-50 text-xs font-medium transition-colors"
                                    >
                                      {savingViewEdit ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      onClick={() => { setViewEditingCallId(null); setViewEditText(""); }}
                                      className="px-3 py-1 bg-slate-200 text-slate-600 rounded-md hover:bg-slate-300 text-xs font-medium transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => { setViewEditingCallId(call.id); setViewEditText(call.formatted_output || ""); }}
                                    className="px-3 py-1 bg-slate-200 text-slate-600 rounded-md hover:bg-slate-300 text-xs font-medium transition-colors"
                                  >
                                    Edit Formatting
                                  </button>
                                )}
                              </div>
                            </div>
                            {viewEditingCallId === call.id ? (
                              <div>
                                <FormattingToolbar
                                  textareaRef={viewEditTextareaRef}
                                  value={viewEditText}
                                  onChange={setViewEditText}
                                />
                                <div className="grid grid-cols-2 gap-3">
                                  <ImageTextarea
                                    textareaRef={viewEditTextareaRef}
                                    value={viewEditText}
                                    onChange={setViewEditText}
                                    rows={25}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs input-font bg-white"
                                  />
                                  <div className="p-3 bg-white rounded-lg border border-slate-200 overflow-y-auto max-h-[600px]">
                                    <div className="text-[10px] text-slate-400 mb-2 font-medium uppercase tracking-wide">Preview</div>
                                    {renderFormattedText(viewEditText)}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              renderFormattedText(call.formatted_output)
                            )}
                          </div>
                        )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </>)}
      </main>
    </div>
  );
}
