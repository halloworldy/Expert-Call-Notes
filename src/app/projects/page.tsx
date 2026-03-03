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

  const supabase = createClient();

  useEffect(() => {
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

  async function togglePin(e: React.MouseEvent, projectId: string, currentlyPinned: boolean) {
    e.preventDefault();
    e.stopPropagation();
    await supabase
      .from("projects")
      .update({ is_pinned: !currentlyPinned })
      .eq("id", projectId);
    loadProjects();
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

  // Filter by search then sort: pinned first, then by updated_at
  const filteredProjects = projects
    .filter((p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 border-b border-slate-700">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-white tracking-tight">
            PE Diligence Notes
          </h1>
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
              <p className="text-sm">No projects match &ldquo;{searchQuery}&rdquo;</p>
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
                className="block bg-white rounded-lg border border-slate-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => togglePin(e, project.id, project.is_pinned)}
                      className={`text-lg transition-colors ${
                        project.is_pinned
                          ? "text-blue-600"
                          : "text-slate-300 hover:text-slate-400"
                      }`}
                      title={project.is_pinned ? "Unpin project" : "Pin project"}
                    >
                      {project.is_pinned ? "\u{1F4CC}" : "\u{1F4CC}"}
                    </button>
                    <h3 className="text-sm font-medium text-slate-900">
                      {project.name}
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400">
                    Updated {formatDate(project.updated_at)}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 ml-8">
                  Created {formatDate(project.created_at)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
