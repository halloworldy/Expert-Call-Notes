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
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    setDeleting(true);
    // Delete related data first, then the project
    await supabase.from("expert_calls").delete().eq("project_id", projectId);
    await supabase.from("section_dividers").delete().eq("project_id", projectId);
    await supabase.from("tracker_files").delete().eq("project_id", projectId);
    await supabase.from("projects").delete().eq("id", projectId);
    setDeleteConfirm(null);
    setDeleting(false);
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
        </div>
      </header>

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
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteConfirm(project.id);
                      }}
                      className="text-xs font-medium px-2.5 py-1 rounded transition-colors text-red-400 hover:bg-red-50 hover:text-red-600 opacity-0 group-hover:opacity-100"
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

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => !deleting && setDeleteConfirm(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900 mb-2">
              Delete Project
            </h3>
            <p className="text-sm text-slate-600 mb-1">
              Are you sure you want to delete{" "}
              <span className="font-medium">
                {projects.find((p) => p.id === deleteConfirm)?.name}
              </span>
              ?
            </p>
            <p className="text-xs text-slate-400 mb-5">
              This will permanently delete all expert calls, dividers, and tracker data associated with this project. This action cannot be undone.
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={(e) => deleteProject(e, deleteConfirm)}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium transition-colors"
              >
                {deleting ? "Deleting..." : "Delete Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
