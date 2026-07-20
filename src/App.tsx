import { useCallback, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "./api";
import { EntityDetail } from "./EntityDetail";
import type { Entity, EntityType, WorkspaceInfo } from "./types";
import "./App.css";

type View = "inbox" | "projects" | "search";

const CAPTURE_TYPES: { value: EntityType; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "task", label: "Task" },
  { value: "project", label: "Proj" },
  { value: "person", label: "Person" },
  { value: "inbox", label: "Dump" },
];

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function typeBadge(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function isTaskDone(entity: Entity): boolean {
  return entity.metadata?.status === "done";
}

function App() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [projects, setProjects] = useState<Entity[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [projectEntities, setProjectEntities] = useState<Entity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [view, setView] = useState<View>("inbox");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [captureTitle, setCaptureTitle] = useState("");
  const [captureType, setCaptureType] = useState<EntityType>("note");
  const [captureBody, setCaptureBody] = useState("");
  const [captureProjectId, setCaptureProjectId] = useState("");

  const [newWorkspaceName, setNewWorkspaceName] = useState("My Brain");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Entity[]>([]);

  const refreshLists = useCallback(async () => {
    const [all, projectList] = await Promise.all([
      api.entityList(undefined, 200),
      api.entityList("project", 100),
    ]);
    setEntities(all);
    setProjects(projectList);
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      setRecent(await api.workspaceListRecent());
    } catch {
      setRecent([]);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const current = await api.workspaceCurrent();
        if (current) {
          setWorkspace(current);
          await refreshLists();
        }
      } catch {
        // no workspace yet
      }
      await loadRecent();
    })();
  }, [loadRecent, refreshLists]);

  useEffect(() => {
    if (!selectedProjectId || !workspace) {
      setProjectEntities([]);
      return;
    }
    void (async () => {
      try {
        setProjectEntities(await api.projectListEntities(selectedProjectId));
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [selectedProjectId, workspace, entities]);

  const openExisting = async (path?: string) => {
    setError(null);
    setBusy(true);
    try {
      let target = path;
      if (!target) {
        const picked = await open({
          directory: true,
          multiple: false,
          title: "Open External Brain Drive workspace",
        });
        if (!picked || Array.isArray(picked)) {
          setBusy(false);
          return;
        }
        target = picked;
      }
      const info = await api.workspaceOpen(target);
      setWorkspace(info);
      setSelectedEntityId(null);
      setView("inbox");
      await refreshLists();
      await loadRecent();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const createWorkspace = async () => {
    setError(null);
    setBusy(true);
    try {
      const parent = await open({
        directory: true,
        multiple: false,
        title: "Choose parent folder for new workspace",
      });
      if (!parent || Array.isArray(parent)) {
        setBusy(false);
        return;
      }
      const info = await api.workspaceCreate(parent, newWorkspaceName);
      setWorkspace(info);
      setSelectedEntityId(null);
      setView("inbox");
      await refreshLists();
      await loadRecent();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const capture = async () => {
    if (!captureTitle.trim()) {
      setError("Title is required.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const created = await api.entityCreate({
        entityType: captureType,
        title: captureTitle.trim(),
        description: captureBody.trim(),
        projectId: captureProjectId || undefined,
      });
      setCaptureTitle("");
      setCaptureBody("");
      await refreshLists();
      setSelectedEntityId(created.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const runSearch = async () => {
    setError(null);
    setBusy(true);
    try {
      setSearchResults(await api.entitySearch(searchQuery));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleEntityChanged = async () => {
    await refreshLists();
    if (searchQuery.trim()) {
      try {
        setSearchResults(await api.entitySearch(searchQuery));
      } catch {
        // ignore refresh search errors
      }
    }
  };

  const inboxItems = useMemo(
    () => entities.filter((e) => e.entityType !== "project"),
    [entities],
  );

  const renderEntityRow = (e: Entity) => {
    const done = e.entityType === "task" && isTaskDone(e);
    return (
      <li key={e.id}>
        <button
          type="button"
          className={
            selectedEntityId === e.id
              ? "entity-row selected"
              : "entity-row"
          }
          onClick={() => setSelectedEntityId(e.id)}
        >
          <span className={`badge type-${e.entityType}`}>
            {typeBadge(e.entityType)}
          </span>
          <div className="entity-row-body">
            <strong className={done ? "done" : undefined}>{e.title}</strong>
            {e.description && <p>{e.description}</p>}
            <small className="muted">{formatWhen(e.updatedAt)}</small>
          </div>
        </button>
      </li>
    );
  };

  if (!workspace) {
    return (
      <div className="shell welcome">
        <div className="welcome-card">
          <p className="eyebrow">External Brain Drive</p>
          <h1>Your local-first external brain</h1>
          <p className="lede">
            One trusted home for projects, notes, tasks, people, and decisions —
            stored on your machine, searchable offline.
          </p>

          {error && <div className="banner error">{error}</div>}

          <section className="panel">
            <h2>Create workspace</h2>
            <label>
              Name
              <input
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="My Brain"
              />
            </label>
            <button disabled={busy} onClick={() => void createWorkspace()}>
              Choose folder & create
            </button>
          </section>

          <section className="panel">
            <h2>Open workspace</h2>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void openExisting()}
            >
              Browse for workspace folder
            </button>
            {recent.length > 0 && (
              <div className="recent">
                <p>Recent</p>
                <ul>
                  {recent.map((path) => (
                    <li key={path}>
                      <button
                        className="linkish"
                        disabled={busy}
                        onClick={() => void openExisting(path)}
                      >
                        {path}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className={selectedEntityId ? "shell app with-detail" : "shell app"}>
      <aside className="sidebar">
        <div className="brand">
          <strong>External Brain Drive</strong>
          <span>{workspace.name}</span>
        </div>
        <nav>
          <button
            className={view === "inbox" ? "nav active" : "nav"}
            onClick={() => setView("inbox")}
          >
            Inbox / Capture
          </button>
          <button
            className={view === "projects" ? "nav active" : "nav"}
            onClick={() => setView("projects")}
          >
            Projects
          </button>
          <button
            className={view === "search" ? "nav active" : "nav"}
            onClick={() => setView("search")}
          >
            Search
          </button>
        </nav>
        <div className="sidebar-foot">
          <p className="muted path" title={workspace.path}>
            {workspace.path}
          </p>
          <button
            className="secondary small"
            onClick={() => {
              setWorkspace(null);
              setEntities([]);
              setProjects([]);
              setSelectedEntityId(null);
            }}
          >
            Switch workspace
          </button>
        </div>
      </aside>

      <main className="main">
        {error && <div className="banner error">{error}</div>}

        {view === "inbox" && (
          <>
            <header className="page-header">
              <h1>Capture</h1>
              <p>Dump first. Organize later. Click any item to open details.</p>
            </header>

            <section className="panel capture">
              <div className="row capture-title-row">
                <select
                  className="type-select"
                  value={captureType}
                  onChange={(e) =>
                    setCaptureType(e.target.value as EntityType)
                  }
                  aria-label="Entity type"
                  title={
                    CAPTURE_TYPES.find((t) => t.value === captureType)?.label
                  }
                >
                  {CAPTURE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <input
                  className="title-input"
                  value={captureTitle}
                  onChange={(e) => setCaptureTitle(e.target.value)}
                  placeholder="What's on your mind?"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      void capture();
                    }
                  }}
                />
              </div>
              <textarea
                value={captureBody}
                onChange={(e) => setCaptureBody(e.target.value)}
                placeholder="Optional details…"
                rows={3}
              />
              <div className="row capture-actions-row">
                <select
                  className="project-select"
                  value={captureProjectId}
                  onChange={(e) => setCaptureProjectId(e.target.value)}
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <button disabled={busy} onClick={() => void capture()}>
                  Capture
                </button>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>Recent entities</h2>
                <span className="muted">{inboxItems.length} items</span>
              </div>
              {inboxItems.length === 0 ? (
                <p className="empty">Nothing captured yet. Start above.</p>
              ) : (
                <ul className="entity-list">
                  {inboxItems.map(renderEntityRow)}
                </ul>
              )}
            </section>
          </>
        )}

        {view === "projects" && (
          <>
            <header className="page-header">
              <h1>Projects</h1>
              <p>Projects are entities that contain other entities.</p>
            </header>

            <div className="split">
              <section className="panel">
                <h2>All projects</h2>
                {projects.length === 0 ? (
                  <p className="empty">
                    Capture a project from the Inbox view first.
                  </p>
                ) : (
                  <ul className="entity-list compact">
                    {projects.map((p) => (
                      <li key={p.id}>
                        <div className="project-pick">
                          <button
                            className={
                              selectedProjectId === p.id
                                ? "linkish active"
                                : "linkish"
                            }
                            onClick={() => setSelectedProjectId(p.id)}
                          >
                            {p.title}
                          </button>
                          <button
                            className="secondary small"
                            type="button"
                            onClick={() => setSelectedEntityId(p.id)}
                          >
                            Edit
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="panel">
                <h2>
                  {selectedProjectId
                    ? projects.find((p) => p.id === selectedProjectId)?.title ??
                      "Project"
                    : "Select a project"}
                </h2>
                {!selectedProjectId ? (
                  <p className="empty">Choose a project to see linked items.</p>
                ) : projectEntities.length === 0 ? (
                  <p className="empty">
                    No linked items yet. Capture with this project selected, or
                    link from the detail panel.
                  </p>
                ) : (
                  <ul className="entity-list">
                    {projectEntities.map(renderEntityRow)}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}

        {view === "search" && (
          <>
            <header className="page-header">
              <h1>Search</h1>
              <p>Full-text search over titles and descriptions (FTS5).</p>
            </header>

            <section className="panel">
              <div className="row">
                <input
                  className="grow"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search your brain…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void runSearch();
                  }}
                />
                <button disabled={busy} onClick={() => void runSearch()}>
                  Search
                </button>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>Results</h2>
                <span className="muted">{searchResults.length}</span>
              </div>
              {searchResults.length === 0 ? (
                <p className="empty">No results yet.</p>
              ) : (
                <ul className="entity-list">
                  {searchResults.map(renderEntityRow)}
                </ul>
              )}
            </section>
          </>
        )}
      </main>

      {selectedEntityId && (
        <EntityDetail
          entityId={selectedEntityId}
          projects={projects}
          onClose={() => setSelectedEntityId(null)}
          onChanged={() => void handleEntityChanged()}
          onError={(message) => setError(message)}
        />
      )}
    </div>
  );
}

export default App;
