"use client";

import { useEffect, useState, useCallback, type DragEvent } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { DEFAULT_PROMPT } from "@/lib/default-prompt";
import type {
  Project,
  ExpertCall,
  SectionDivider,
  ProjectItem,
} from "@/lib/types";
import Link from "next/link";

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
    const clean = line.replace(/\*{1,2}/g, "").replace(/_{1,2}/g, "");

    const headerMatch = clean.match(/^(?:#{1,3}\s+)?(\d+)\.\s+(.+)$/);
    if (headerMatch) {
      elements.push(
        <div
          key={i}
          className="mt-3 mb-1.5 font-semibold text-slate-900 text-sm"
        >
          {headerMatch[1]}. {headerMatch[2]}
        </div>
      );
      return;
    }
    const mdMatch = clean.match(/^#{1,3}\s+(.+)$/);
    if (mdMatch) {
      elements.push(
        <div
          key={i}
          className="mt-3 mb-1.5 font-semibold text-slate-900 text-sm"
        >
          {mdMatch[1]}
        </div>
      );
      return;
    }
    const subMatch = clean.match(/^([a-z])[.)]\s+(.+)$/);
    if (subMatch) {
      elements.push(
        <div key={i} className="ml-5 my-0.5 text-slate-700 text-sm">
          <span className="font-medium text-slate-800">{subMatch[1]}.</span>{" "}
          {subMatch[2]}
        </div>
      );
      return;
    }
    const romanMatch = clean.match(
      /^(i{1,3}|iv|vi{0,3}|ix|x{0,3})[.)]\s+(.+)$/
    );
    if (romanMatch) {
      elements.push(
        <div key={i} className="ml-10 my-0.5 text-slate-600 text-sm">
          <span className="italic text-slate-500">{romanMatch[1]}.</span>{" "}
          {romanMatch[2]}
        </div>
      );
      return;
    }
    elements.push(
      <div key={i} className="my-0.5 text-slate-700 text-sm">
        {clean}
      </div>
    );
  });
  return <>{elements}</>;
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

  // View / edit
  const [viewingCall, setViewingCall] = useState<ExpertCall | null>(null);
  const [editingCallId, setEditingCallId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    expert_name: "",
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

  const supabase = createClient();

  const loadProject = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();
    if (data) setProject(data);
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
  }, [loadProject, loadCalls, loadDividers]);

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
        call_date: callDate,
        raw_notes: rawNotes,
        transcript: transcript || null,
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
      const response = await fetch("/api/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawNotes: call.raw_notes,
          transcript: call.transcript,
          prompt,
        }),
      });
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
      }
    } catch {
      // handled via formatting state
    }
    setFormatting(null);
  }

  // ---- Edit call ----
  function startEditing(call: ExpertCall) {
    setEditingCallId(call.id);
    setEditForm({
      expert_name: call.expert_name,
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
      const blob = await generateDocx(project!, orderedCalls);
      const { saveAs } = await import("file-saver");
      saveAs(blob, `${project!.name.replace(/\s+/g, "_")}_Diligence.docx`);
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
        }),
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${project!.name.replace(/\s+/g, "_")}_Diligence.pdf`;
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

  function handleDrop(e: DragEvent<HTMLDivElement>, targetId: string) {
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
    saveItemOrder(newItems);
    setDraggedItemId(null);
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
    loadDividers();
  }

  async function handleDeleteDivider(id: string) {
    await supabase.from("section_dividers").delete().eq("id", id);
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

        {/* Preview Document button - in main content area */}
        <button
          onClick={() => setShowPreview(!showPreview)}
          className={`mb-5 px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full text-left ${
            showPreview
              ? "bg-blue-700 text-white hover:bg-blue-800"
              : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-blue-300"
          }`}
        >
          {showPreview
            ? "Hide Document Preview"
            : "Preview Document (see how your exported report will look)"}
        </button>

        {/* Document Preview */}
        {showPreview && (
          <div className="bg-white rounded-lg border border-slate-200 p-8 mb-5 preview-doc">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-slate-900 border-0 pb-0 mb-2">
                {project.name}
              </h1>
              <p className="text-slate-500 text-sm">
                Expert Call Diligence Report
              </p>
              <p className="text-slate-400 text-xs mt-1">
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

            <hr className="my-6 border-slate-200" />

            <h2 className="font-semibold text-slate-900 mb-3 text-base">
              Table of Contents
            </h2>
            <div className="mb-6">
              {items
                .filter(
                  (it) =>
                    it.type === "call" &&
                    (it.data as ExpertCall).formatted_output
                )
                .map((it, idx) => {
                  const call = it.data as ExpertCall;
                  return (
                    <div
                      key={call.id}
                      className="flex justify-between items-baseline py-1.5 border-b border-slate-100 text-sm"
                    >
                      <span className="text-slate-800">
                        {idx + 1}.{" "}
                        <span className="font-medium">
                          {call.expert_name}
                        </span>
                      </span>
                      <span className="text-slate-400 text-xs">
                        {formatDate(call.call_date)}
                      </span>
                    </div>
                  );
                })}
            </div>

            <hr className="my-6 border-slate-200" />

            {items.map((item) => {
              if (item.type === "divider") {
                return (
                  <div
                    key={item.data.id}
                    className="flex items-center gap-3 my-6"
                  >
                    <div className="flex-1 border-t border-slate-300" />
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                      {(item.data as SectionDivider).label}
                    </span>
                    <div className="flex-1 border-t border-slate-300" />
                  </div>
                );
              }
              const call = item.data as ExpertCall;
              if (!call.formatted_output) return null;
              return (
                <div key={call.id} className="mb-8">
                  <h1 className="text-lg font-bold text-slate-900 border-b-2 border-blue-800 pb-2 mb-1">
                    {call.expert_name}
                  </h1>
                  <p className="text-slate-400 text-xs italic mb-4">
                    {formatDate(call.call_date)}
                  </p>
                  {renderFormattedText(call.formatted_output)}
                </div>
              );
            })}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-5">
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm font-medium transition-colors"
            >
              + Add Expert Call
            </button>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Call Title
                  </label>
                  <input
                    type="text"
                    value={expertName}
                    onChange={(e) => setExpertName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder='e.g., "Name - Company - Position"'
                  />
                </div>
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
                    className={`flex items-center gap-3 py-2 px-3 rounded-lg border border-transparent hover:border-slate-200 group transition-all ${
                      draggedItemId === div.id ? "opacity-40" : ""
                    }`}
                  >
                    <span className="drag-handle text-slate-300 group-hover:text-slate-400 text-sm select-none">
                      &#x2630;
                    </span>
                    <div className="flex-1 border-t border-slate-300" />
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      {div.label}
                    </span>
                    <div className="flex-1 border-t border-slate-300" />
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
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Call Title
                          </label>
                          <input
                            type="text"
                            value={editForm.expert_name}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                expert_name: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
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
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Formatted Output
                          </label>
                          <textarea
                            value={editForm.formatted_output}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                formatted_output: e.target.value,
                              })
                            }
                            rows={10}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs input-font"
                          />
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
                            <p className="text-xs text-slate-400">
                              {formatDate(call.call_date)} &middot; Added{" "}
                              {formatDateTime(call.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {call.formatted_output ? (
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

                      {/* Raw notes preview */}
                      <p className="text-xs text-slate-500 line-clamp-2 mb-3 ml-6">
                        {call.raw_notes.substring(0, 250)}
                        {call.raw_notes.length > 250 ? "..." : ""}
                      </p>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100 ml-6 flex-wrap">
                        <button
                          onClick={() => startEditing(call)}
                          className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 text-xs font-medium transition-colors"
                        >
                          Edit
                        </button>

                        {!call.formatted_output && (
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
                            <button
                              onClick={() => handleFormat(call.id)}
                              disabled={formatting === call.id}
                              className="px-3 py-1.5 bg-slate-100 text-blue-700 rounded-md hover:bg-blue-50 disabled:opacity-50 text-xs font-medium transition-colors"
                            >
                              {formatting === call.id
                                ? "Re-formatting..."
                                : "Re-format"}
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => handleDeleteCall(call.id)}
                          className="px-3 py-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md text-xs font-medium transition-colors ml-auto"
                        >
                          Delete
                        </button>
                      </div>

                      {/* Formatting prompt (below actions) */}
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

                      {/* Formatted output view */}
                      {viewingCall?.id === call.id &&
                        call.formatted_output && (
                          <div className="mt-3 p-4 bg-slate-50 rounded-lg border border-slate-100 ml-6">
                            {renderFormattedText(call.formatted_output)}
                          </div>
                        )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
