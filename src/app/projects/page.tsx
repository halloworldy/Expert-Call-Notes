"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { Project } from "@/lib/types";
import Link from "next/link";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Telegram settings
  const [showTelegramSettings, setShowTelegramSettings] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);

  // Editable app name
  const [appName, setAppName] = useState("Tech Team - Notes Library");
  const [editingAppName, setEditingAppName] = useState(false);
  const [tempAppName, setTempAppName] = useState("");

  const supabase = createClient();

  useEffect(() => {
    const saved = localStorage.getItem("appName");
    if (saved) setAppName(saved);
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProjects() {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("updated_at", { ascending: false });

    if (!error && data) {
      setProjects(data);
    }
    setLoading(false);
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);

    const { error } = await supabase.from("projects").insert({
      name: newName.trim(),
    });

    if (!error) {
      setNewName("");
      loadProjects();
    }
    setCreating(false);
  }

  async function togglePin(
    e: React.MouseEvent,
    projectId: string,
    currentlyPinned: boolean
  ) {
    e.preventDefault();
    e.stopPropagation();
    const { error } = await supabase
      .from("projects")
      .update({ is_pinned: !currentlyPinned })
      .eq("id", projectId);
    if (!error) loadProjects();
  }

  async function deleteProject(e: React.MouseEvent, projectId: string) {
    e.preventDefault();
    e.stopPropagation();
    // Delete related data first, then the project
    await supabase.from("expert_calls").delete().eq("project_id", projectId);
    await supabase.from("section_dividers").delete().eq("project_id", projectId);
    await supabase.from("tracker_files").delete().eq("project_id", projectId);
    await supabase.from("projects").delete().eq("id", projectId);
    setDeleteConfirmId(null);
    loadProjects();
  }

  function startEditingAppName() {
    setTempAppName(appName);
    setEditingAppName(true);
  }

  function saveAppName() {
    const name = tempAppName.trim() || "Tech Team - Notes Library";
    setAppName(name);
    localStorage.setItem("appName", name);
    setEditingAppName(false);
  }

  async function setupTelegramWebhook() {
    setTelegramLoading(true);
    setTelegramStatus(null);
    try {
      const webhookUrl = `${window.location.origin}/api/telegram/webhook`;
      const res = await fetch("/api/telegram/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl }),
      });
      const data = await res.json();
      if (res.ok) {
        setTelegramStatus(`Webhook registered at ${webhookUrl}`);
      } else {
        setTelegramStatus(`Error: ${data.error}`);
      }
    } catch {
      setTelegramStatus("Failed to connect to setup endpoint");
    }
    setTelegramLoading(false);
  }

  async function checkTelegramStatus() {
    setTelegramLoading(true);
    try {
      const res = await fetch("/api/telegram/setup");
      const data = await res.json();
      if (data.result?.url) {
        setTelegramStatus(`Active webhook: ${data.result.url}`);
      } else {
        setTelegramStatus("No webhook configured");
      }
    } catch {
      setTelegramStatus("Could not check status");
    }
    setTelegramLoading(false);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const filteredProjects = projects
    .filter((p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const aPinned = a.is_pinned ?? false;
      const bPinned = b.is_pinned ?? false;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return (
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 border-b border-slate-700">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          {editingAppName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tempAppName}
                onChange={(e) => setTempAppName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveAppName();
                  if (e.key === "Escape") setEditingAppName(false);
                }}
                autoFocus
                className="px-3 py-1 bg-slate-800 border border-slate-600 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={saveAppName}
                className="px-2 py-1 text-xs bg-blue-700 text-white rounded-md hover:bg-blue-800"
              >
                Save
              </button>
              <button
                onClick={() => setEditingAppName(false)}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            </div>
          ) : (
            <h1
              onClick={startEditingAppName}
              className="text-lg font-semibold text-white tracking-tight cursor-pointer hover:text-slate-300 transition-colors"
              title="Click to rename"
            >
              {appName}
            </h1>
          )}
          <button
            onClick={() => setShowTelegramSettings(!showTelegramSettings)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              showTelegramSettings
                ? "bg-blue-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Telegram Bot
          </button>
        </div>
      </header>

      {showTelegramSettings && (
        <div className="bg-slate-100 border-b border-slate-200">
          <div className="max-w-5xl mx-auto px-6 py-4">
            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Telegram Bot Integration</h3>
              <p className="text-xs text-slate-500 mb-4">
                Send raw call notes to a Telegram bot and receive formatted results. Set the <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">TELEGRAM_BOT_TOKEN</code> env variable, then register the webhook below.
              </p>
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={setupTelegramWebhook}
                  disabled={telegramLoading}
                  className="px-4 py-2 text-xs font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors"
                >
                  {telegramLoading ? "Working..." : "Register Webhook"}
                </button>
                <button
                  onClick={checkTelegramStatus}
                  disabled={telegramLoading}
                  className="px-4 py-2 text-xs font-medium bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 disabled:opacity-50 transition-colors"
                >
                  Check Status
                </button>
              </div>
              {telegramStatus && (
                <p className={`text-xs ${telegramStatus.startsWith("Error") || telegramStatus.startsWith("Failed") || telegramStatus.startsWith("Could not") ? "text-red-600" : "text-green-700"}`}>
                  {telegramStatus}
                </p>
              )}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  <strong>Bot commands:</strong> /start, /projects (select a project), /selected (show current project), /help
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  <strong>Usage:</strong> Select a project, then send raw notes. Prefix with &quot;Expert: Name&quot; on the first line to set the expert name.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-900">Projects</h2>
        </div>

        {/* Search */}
        <div className="mb-5">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-sm text-slate-900 placeholder-slate-400"
          />
        </div>

        {/* Create project */}
        <form
          onSubmit={createProject}
          className="mb-8 flex items-center gap-3"
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New project name"
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-sm"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="px-5 py-2.5 bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            {creating ? "Creating..." : "Create Project"}
          </button>
        </form>

        {loading ? (
          <p className="text-slate-500 text-sm">Loading projects...</p>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            {searchQuery ? (
              <p className="text-sm">
                No projects match &ldquo;{searchQuery}&rdquo;
              </p>
            ) : (
              <>
                <p className="text-base mb-2">No projects yet</p>
                <p className="text-sm">
                  Create your first project to start managing expert calls.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredProjects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className={`block bg-white rounded-lg border p-4 hover:shadow-sm transition-all group ${
                  project.is_pinned
                    ? "border-blue-200 border-l-4 border-l-blue-500"
                    : "border-slate-200 hover:border-blue-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-medium text-slate-900">
                      {project.name}
                    </h3>
                    {project.is_pinned && (
                      <span className="text-xs text-blue-600 font-medium">
                        Pinned
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) =>
                        togglePin(e, project.id, project.is_pinned ?? false)
                      }
                      className="text-xs font-medium px-2.5 py-1 rounded transition-colors bg-slate-100 text-slate-500 hover:bg-slate-200 opacity-0 group-hover:opacity-100"
                    >
                      {project.is_pinned ? "Unpin" : "Pin"}
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteConfirmId(project.id); }}
                      className="text-xs font-medium px-2.5 py-1 rounded transition-colors bg-slate-100 text-red-500 hover:bg-red-50 hover:text-red-700 opacity-0 group-hover:opacity-100"
                    >
                      Delete
                    </button>
                    <span className="text-xs text-slate-400">
                      Updated {formatDate(project.updated_at)}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Created {formatDate(project.created_at)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Delete confirmation dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Delete Project</h3>
            <p className="text-sm text-slate-600 mb-5">
              Are you sure you want to delete this project? All expert calls, section dividers, and tracker data will be permanently removed. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={(e) => deleteProject(e, deleteConfirmId)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
