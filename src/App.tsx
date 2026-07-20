import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "./api";
import { EntityDetail } from "./EntityDetail";
import type { BackupInfo, Entity, EntityType, WorkspaceInfo } from "./types";
import "./App.css";

type View = "focus" | "inbox" | "projects" | "search" | "backups";

const CAPTURE_TYPES: { value: EntityType; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "task", label: "Task" },
  { value: "project", label: "Proj" },
  { value: "person", label: "Person" },
  { value: "inbox", label: "Dump" },
];

const FILTER_CHIPS: { value: "all" | EntityType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "note", label: "Notes" },
  { value: "task", label: "Tasks" },
  { value: "person", label: "People" },
  { value: "inbox", label: "Dumps" },
  { value: "project", label: "Projects" },
];

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatRelative(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 14) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
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
  const [view, setView] = useState<View>("focus");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<"all" | EntityType>("all");

  const [captureTitle, setCaptureTitle] = useState("");
  const [captureType, setCaptureType] = useState<EntityType>("note");
  const [captureBody, setCaptureBody] = useState("");
  const [captureProjectId, setCaptureProjectId] = useState("");

  const [newWorkspaceName, setNewWorkspaceName] = useState("My Brain");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Entity[]>([]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);

  const refreshLists = useCallback(async () => {
    const [all, projectList] = await Promise.all([
      api.entityList(undefined, 200),
      api.entityList("project", 100),
    ]);
    setEntities(all);
    setProjects(projectList);
  }, []);

  const refreshBackups = useCallback(async () => {
    try {
      setBackups(await api.backupList());
    } catch {
      setBackups([]);
    }
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      setRecent(await api.workspaceListRecent());
    } catch {
      setRecent([]);
    }
  }, []);

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message);
  }, []);

  useEffect(() => {
    if (!statusMessage) return;
    const t = window.setTimeout(() => setStatusMessage(null), 4000);
    return () => window.clearTimeout(t);
  }, [statusMessage]);

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

  useEffect(() => {
    if (view === "backups" && workspace) {
      void refreshBackups();
    }
  }, [view, workspace, refreshBackups]);

  // Escape closes detail panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedEntityId) {
        setSelectedEntityId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedEntityId]);

  // Focus capture field when entering capture-related views
  useEffect(() => {
    if (workspace && (view === "focus" || view === "inbox")) {
      const t = window.setTimeout(() => titleInputRef.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [workspace, view]);

  const enterWorkspace = async (
    info: WorkspaceInfo,
    nextView: View = "focus",
  ) => {
    setWorkspace(info);
    setSelectedEntityId(null);
    setView(nextView);
    await refreshLists();
    await loadRecent();
  };

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
      await enterWorkspace(info);
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
      await enterWorkspace(info);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const capture = async () => {
    if (!captureTitle.trim()) {
      setError("Title is required.");
      titleInputRef.current?.focus();
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
      showStatus(`Captured ${typeBadge(created.entityType)}: ${created.title}`);
      window.setTimeout(() => titleInputRef.current?.focus(), 30);
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

  const createBackupNow = async () => {
    setError(null);
    setBusy(true);
    try {
      const info = await api.backupCreate();
      showStatus(`Backup saved: ${info.fileName}`);
      await refreshBackups();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async (backup: BackupInfo) => {
    const ok = window.confirm(
      `Restore from ${backup.fileName}?\n\nA safety backup of the current database will be created first. Your current data will be replaced by this snapshot.`,
    );
    if (!ok) return;

    setError(null);
    setBusy(true);
    try {
      const safety = await api.backupRestore(backup.path);
      setSelectedEntityId(null);
      await refreshLists();
      await refreshBackups();
      showStatus(
        `Restored from ${backup.fileName}. Safety copy: ${safety.fileName}`,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleTaskDone = async (entity: Entity, e: React.MouseEvent) => {
    e.stopPropagation();
    if (entity.entityType !== "task") return;
    setBusy(true);
    try {
      const next = isTaskDone(entity) ? "open" : "done";
      await api.entityUpdate({
        id: entity.id,
        metadata: { ...entity.metadata, status: next },
      });
      await refreshLists();
      showStatus(next === "done" ? `Done: ${entity.title}` : `Reopened: ${entity.title}`);
    } catch (err) {
      setError(String(err));
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
        // ignore
      }
    }
  };

  const openTasks = useMemo(
    () =>
      entities.filter((e) => e.entityType === "task" && !isTaskDone(e)),
    [entities],
  );

  const recentlyTouched = useMemo(() => {
    return [...entities]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 12);
  }, [entities]);

  const inboxItems = useMemo(() => {
    let list = entities;
    if (inboxFilter === "all") {
      list = entities.filter((e) => e.entityType !== "project");
    } else {
      list = entities.filter((e) => e.entityType === inboxFilter);
    }
    return list;
  }, [entities, inboxFilter]);

  const stats = useMemo(() => {
    const notes = entities.filter((e) => e.entityType === "note").length;
    const tasksOpen = openTasks.length;
    const tasksDone = entities.filter(
      (e) => e.entityType === "task" && isTaskDone(e),
    ).length;
    return {
      total: entities.length,
      notes,
      tasksOpen,
      tasksDone,
      projects: projects.length,
    };
  }, [entities, openTasks.length, projects.length]);

  const renderEntityRow = (e: Entity, opts?: { showToggle?: boolean }) => {
    const done = e.entityType === "task" && isTaskDone(e);
    return (
      <li key={e.id}>
        <div
          className={
            selectedEntityId === e.id
              ? "entity-row-wrap selected"
              : "entity-row-wrap"
          }
        >
          {opts?.showToggle && e.entityType === "task" && (
            <button
              type="button"
              className={done ? "task-check checked" : "task-check"}
              title={done ? "Mark open" : "Mark done"}
              disabled={busy}
              onClick={(ev) => void toggleTaskDone(e, ev)}
              aria-label={done ? "Mark open" : "Mark done"}
            >
              {done ? "✓" : ""}
            </button>
          )}
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
              <small className="muted">{formatRelative(e.updatedAt)}</small>
            </div>
          </button>
        </div>
      </li>
    );
  };

  const capturePanel = (
    <section className="panel capture">
      <div className="row capture-title-row">
        <select
          className="type-select"
          value={captureType}
          onChange={(e) => setCaptureType(e.target.value as EntityType)}
          aria-label="Entity type"
          title={CAPTURE_TYPES.find((t) => t.value === captureType)?.label}
        >
          {CAPTURE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          ref={titleInputRef}
          className="title-input"
          value={captureTitle}
          onChange={(e) => setCaptureTitle(e.target.value)}
          placeholder="What's on your mind? (Enter to capture)"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void capture();
            }
          }}
        />
      </div>
      <textarea
        value={captureBody}
        onChange={(e) => setCaptureBody(e.target.value)}
        placeholder="Optional details… (Shift+Enter for newline in title is n/a; use this field)"
        rows={2}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void capture();
          }
        }}
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
  );

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
                onKeyDown={(e) => {
                  if (e.key === "Enter") void createWorkspace();
                }}
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
            className={view === "focus" ? "nav active" : "nav"}
            onClick={() => setView("focus")}
          >
            Daily Focus
          </button>
          <button
            className={view === "inbox" ? "nav active" : "nav"}
            onClick={() => setView("inbox")}
          >
            Capture
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
          <button
            className={view === "backups" ? "nav active" : "nav"}
            onClick={() => setView("backups")}
          >
            Backups
          </button>
        </nav>
        <div className="sidebar-stats muted">
          <span>{stats.tasksOpen} open tasks</span>
          <span>{stats.total} entities</span>
        </div>
        <div className="sidebar-foot">
          <p className="muted path" title={workspace.path}>
            {workspace.path}
          </p>
          <button
            className="secondary small"
            disabled={busy}
            onClick={() => void createBackupNow()}
          >
            Backup now
          </button>
          <button
            className="secondary small"
            onClick={() => {
              setWorkspace(null);
              setEntities([]);
              setProjects([]);
              setSelectedEntityId(null);
              setBackups([]);
              setStatusMessage(null);
              setView("focus");
            }}
          >
            Switch workspace
          </button>
        </div>
      </aside>

      <main className="main">
        {error && <div className="banner error">{error}</div>}
        {statusMessage && (
          <div className="banner success">{statusMessage}</div>
        )}

        {view === "focus" && (
          <>
            <header className="page-header">
              <h1>Daily Focus</h1>
              <p>
                Open tasks and what you touched recently. Capture below — press{" "}
                <kbd>Enter</kbd> to save.
              </p>
            </header>

            {capturePanel}

            <div className="split focus-split">
              <section className="panel">
                <div className="panel-head">
                  <h2>Open tasks</h2>
                  <span className="muted">{openTasks.length}</span>
                </div>
                {openTasks.length === 0 ? (
                  <p className="empty">
                    No open tasks. Capture type <strong>Task</strong> to add
                    one.
                  </p>
                ) : (
                  <ul className="entity-list">
                    {openTasks.map((e) =>
                      renderEntityRow(e, { showToggle: true }),
                    )}
                  </ul>
                )}
              </section>

              <section className="panel">
                <div className="panel-head">
                  <h2>Recently touched</h2>
                  <span className="muted">{recentlyTouched.length}</span>
                </div>
                {recentlyTouched.length === 0 ? (
                  <p className="empty">Nothing yet — capture something.</p>
                ) : (
                  <ul className="entity-list">
                    {recentlyTouched.map((e) =>
                      renderEntityRow(e, { showToggle: e.entityType === "task" }),
                    )}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}

        {view === "inbox" && (
          <>
            <header className="page-header">
              <h1>Capture</h1>
              <p>
                Dump first. Organize later. <kbd>Enter</kbd> captures ·{" "}
                <kbd>Esc</kbd> closes detail.
              </p>
            </header>

            {capturePanel}

            <section className="panel">
              <div className="panel-head">
                <h2>Entities</h2>
                <span className="muted">{inboxItems.length}</span>
              </div>
              <div className="chip-row">
                {FILTER_CHIPS.map((chip) => (
                  <button
                    key={chip.value}
                    type="button"
                    className={
                      inboxFilter === chip.value
                        ? "chip active"
                        : "chip"
                    }
                    onClick={() => setInboxFilter(chip.value)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              {inboxItems.length === 0 ? (
                <p className="empty">Nothing in this filter yet.</p>
              ) : (
                <ul className="entity-list">
                  {inboxItems.map((e) =>
                    renderEntityRow(e, {
                      showToggle: e.entityType === "task",
                    }),
                  )}
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
                    Capture a project (type Proj) from Focus or Capture.
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
                    No linked items yet. Capture with a project selected, or
                    link from the detail panel.
                  </p>
                ) : (
                  <ul className="entity-list">
                    {projectEntities.map((e) =>
                      renderEntityRow(e, {
                        showToggle: e.entityType === "task",
                      }),
                    )}
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
                  autoFocus
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
                  {searchResults.map((e) =>
                    renderEntityRow(e, {
                      showToggle: e.entityType === "task",
                    }),
                  )}
                </ul>
              )}
            </section>
          </>
        )}

        {view === "backups" && (
          <>
            <header className="page-header">
              <h1>Backups</h1>
              <p>
                Local snapshots of <code>workspace.db</code> in this
                workspace&apos;s Backups folder. Auto-created on open; last 10
                kept.
              </p>
            </header>

            <section className="panel">
              <div className="row">
                <button disabled={busy} onClick={() => void createBackupNow()}>
                  Create backup now
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void refreshBackups()}
                >
                  Refresh list
                </button>
              </div>
              <p className="muted">
                Restore replaces the live database. A safety backup is written
                first so you can undo a bad restore.
              </p>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>Snapshots</h2>
                <span className="muted">{backups.length}</span>
              </div>
              {backups.length === 0 ? (
                <p className="empty">
                  No backups yet. Open the workspace again or create one now.
                </p>
              ) : (
                <ul className="backup-list">
                  {backups.map((b) => (
                    <li key={b.path}>
                      <div>
                        <strong>{b.fileName}</strong>
                        <small className="muted">
                          {formatWhen(b.createdAt)} ·{" "}
                          {(b.sizeBytes / 1024).toFixed(1)} KB
                        </small>
                      </div>
                      <button
                        className="secondary small"
                        disabled={busy}
                        onClick={() => void restoreBackup(b)}
                      >
                        Restore
                      </button>
                    </li>
                  ))}
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
