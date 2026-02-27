"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { DEFAULT_PROMPT } from "@/lib/default-prompt";
import type { Project, ExpertCall } from "@/lib/types";
import Link from "next/link";

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [calls, setCalls] = useState<ExpertCall[]>([]);
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

  // View formatted output
  const [viewingCall, setViewingCall] = useState<ExpertCall | null>(null);

  // Export states
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

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
    const { data } = await supabase
      .from("expert_calls")
      .select("*")
      .eq("project_id", projectId)
      .order("call_date", { ascending: false });
    if (data) setCalls(data);
    setLoading(false);
  }, [projectId, supabase]);

  useEffect(() => {
    loadProject();
    loadCalls();
  }, [loadProject, loadCalls]);

  async function handleSaveCall(e: React.FormEvent) {
    e.preventDefault();
    if (!expertName.trim() || !rawNotes.trim()) return;
    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Save the call first
    const { data: newCall, error } = await supabase
      .from("expert_calls")
      .insert({
        project_id: projectId,
        expert_name: expertName.trim(),
        call_date: callDate,
        raw_notes: rawNotes,
        transcript: transcript || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error || !newCall) {
      setSubmitting(false);
      return;
    }

    // Update project updated_at and updated_by
    await supabase
      .from("projects")
      .update({ updated_by: user.id })
      .eq("id", projectId);

    // Reset form
    setExpertName("");
    setCallDate(new Date().toISOString().split("T")[0]);
    setRawNotes("");
    setTranscript("");
    setPrompt(DEFAULT_PROMPT);
    setShowForm(false);
    setSubmitting(false);
    loadCalls();
    loadProject();
  }

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
        // Save to database
        await supabase
          .from("expert_calls")
          .update({ formatted_output: result.formatted })
          .eq("id", callId);

        // Update project
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("projects")
            .update({ updated_by: user.id })
            .eq("id", projectId);
        }

        loadCalls();
        loadProject();
      }
    } catch {
      // Error handling: show in UI through formatting state
    }

    setFormatting(null);
  }

  async function handleExportDocx() {
    setExportingDocx(true);
    try {
      // Dynamic import to avoid SSR issues
      const { generateDocx } = await import("@/lib/docx-generator");
      const blob = await generateDocx(project!, calls);
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
      const response = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: project!.name,
          calls: calls.filter((c) => c.formatted_output),
        }),
      });
      if (response.ok) {
        const html = await response.text();
        // Open in new window for print-to-PDF
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          setTimeout(() => printWindow.print(), 500);
        }
      }
    } catch (err) {
      console.error("PDF export failed:", err);
    }
    setExportingPdf(false);
  }

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Project not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/projects"
              className="text-gray-500 hover:text-gray-700"
            >
              &larr; Projects
            </Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportDocx}
              disabled={
                exportingDocx || calls.filter((c) => c.formatted_output).length === 0
              }
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
            >
              {exportingDocx ? "Generating..." : "Export DOCX"}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={
                exportingPdf || calls.filter((c) => c.formatted_output).length === 0
              }
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
            >
              {exportingPdf ? "Generating..." : "Export PDF"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Project info */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Last updated: {formatDateTime(project.updated_at)}</span>
            <span>
              {calls.length} expert call{calls.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Add call button */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="mb-6 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
          >
            + Add Expert Call
          </button>
        )}

        {/* New call form */}
        {showForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              New Expert Call
            </h3>
            <form onSubmit={handleSaveCall} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expert Name
                  </label>
                  <input
                    type="text"
                    value={expertName}
                    onChange={(e) => setExpertName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Dr. John Smith"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Call Date
                  </label>
                  <input
                    type="date"
                    value={callDate}
                    onChange={(e) => setCallDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Raw Notes *
                </label>
                <textarea
                  value={rawNotes}
                  onChange={(e) => setRawNotes(e.target.value)}
                  required
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="Paste your rough notes here..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transcript (optional)
                </label>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="Paste transcript if available..."
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
                >
                  {submitting ? "Saving..." : "Save Call"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Expert calls list */}
        {calls.length === 0 && !showForm ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg mb-2">No expert calls yet</p>
            <p className="text-sm">
              Add your first expert call to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {calls.map((call) => (
              <div
                key={call.id}
                className="bg-white rounded-lg border border-gray-200 p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      {call.expert_name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Call date: {formatDate(call.call_date)} | Added:{" "}
                      {formatDateTime(call.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {call.formatted_output ? (
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        Formatted
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                        Raw Notes Only
                      </span>
                    )}
                  </div>
                </div>

                {/* Raw notes preview */}
                <div className="mb-3">
                  <p className="text-sm text-gray-600 line-clamp-3">
                    {call.raw_notes.substring(0, 300)}
                    {call.raw_notes.length > 300 ? "..." : ""}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                  {!call.formatted_output && (
                    <>
                      {/* Editable prompt section */}
                      <details className="flex-1">
                        <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-700 font-medium">
                          Edit Formatting Prompt
                        </summary>
                        <textarea
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          rows={10}
                          className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                        />
                      </details>
                      <button
                        onClick={() => handleFormat(call.id)}
                        disabled={formatting === call.id}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium whitespace-nowrap"
                      >
                        {formatting === call.id
                          ? "Formatting with Claude..."
                          : "Format with Claude"}
                      </button>
                    </>
                  )}
                  {call.formatted_output && (
                    <>
                      <button
                        onClick={() =>
                          setViewingCall(
                            viewingCall?.id === call.id ? null : call
                          )
                        }
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm font-medium"
                      >
                        {viewingCall?.id === call.id
                          ? "Hide Output"
                          : "View Formatted Output"}
                      </button>
                      <button
                        onClick={() => {
                          // Re-format: clear and re-run
                          handleFormat(call.id);
                        }}
                        disabled={formatting === call.id}
                        className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200 disabled:opacity-50 text-sm font-medium"
                      >
                        {formatting === call.id
                          ? "Re-formatting..."
                          : "Re-format"}
                      </button>
                    </>
                  )}
                </div>

                {/* View formatted output */}
                {viewingCall?.id === call.id && call.formatted_output && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
                      {call.formatted_output}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
