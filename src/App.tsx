import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { api } from "./api";
import { ContactCard } from "./ContactCard";
import { EntityDetail } from "./EntityDetail";
import {
  readContact,
  SORT_TYPES,
  typeLabel,
  withContactMeta,
  type ContactInfo,
} from "./labels";
import type {
  BackupInfo,
  DocumentInfo,
  Entity,
  EntityType,
  LinkBadge,
  WorkspaceInfo,
} from "./types";
import "./App.css";

type View = "home" | "projects" | "people" | "docs" | "search" | "backups";

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

function isTaskDone(entity: Entity): boolean {
  return entity.metadata?.status === "done";
}

const emptyContactForm = (): ContactInfo => ({
  phone: "",
  email: "",
  company: "",
  role: "",
});

function App() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [projects, setProjects] = useState<Entity[]>([]);
  const [people, setPeople] = useState<Entity[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [projectEntities, setProjectEntities] = useState<Entity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [quickNote, setQuickNote] = useState("");
  const [newWorkspaceName, setNewWorkspaceName] = useState("My Brain");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Entity[]>([]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [badgeMap, setBadgeMap] = useState<Record<string, LinkBadge[]>>({});
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [docProjectId, setDocProjectId] = useState("");
  const [attachDocId, setAttachDocId] = useState("");

  const [contactName, setContactName] = useState("");
  const [contactForm, setContactForm] = useState<ContactInfo>(emptyContactForm());
  const [contactNotes, setContactNotes] = useState("");
  const [contactProjectId, setContactProjectId] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [attachPersonId, setAttachPersonId] = useState("");
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);

  const quickRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const win = getCurrentWindow();
        const onTop = await win.isAlwaysOnTop();
        setAlwaysOnTop(onTop);
      } catch {
        // browser preview without Tauri
      }
    })();
  }, []);

  const toggleAlwaysOnTop = async () => {
    try {
      const win = getCurrentWindow();
      const next = !alwaysOnTop;
      await win.setAlwaysOnTop(next);
      setAlwaysOnTop(next);
    } catch (e) {
      setError(String(e));
    }
  };

  const refreshLists = useCallback(async () => {
    const [all, projectList, peopleList, badges, docs] = await Promise.all([
      api.entityList(undefined, 400),
      api.entityList("project", 100),
      api.entityList("person", 300),
      api.entityBadges().catch(() => []),
      api.documentList().catch(() => [] as DocumentInfo[]),
    ]);
    setEntities(all);
    setProjects(projectList);
    setPeople(peopleList);
    setDocuments(docs);
    const map: Record<string, LinkBadge[]> = {};
    for (const row of badges) {
      map[row.entityId] = row.badges;
    }
    setBadgeMap(map);
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
    const t = window.setTimeout(() => setStatusMessage(null), 2500);
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
        // no workspace
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
    if (view === "backups" && workspace) void refreshBackups();
  }, [view, workspace, refreshBackups]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedEntityId) {
        setSelectedEntityId(null);
        return;
      }
      // / focuses quick capture (unless typing in an input)
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault();
        quickRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedEntityId]);

  useEffect(() => {
    if (workspace) {
      const t = window.setTimeout(() => quickRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [workspace]);

  const enterWorkspace = async (info: WorkspaceInfo) => {
    setWorkspace(info);
    setSelectedEntityId(null);
    setView("home");
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
          title: "Open workspace",
        });
        if (!picked || Array.isArray(picked)) {
          setBusy(false);
          return;
        }
        target = picked;
      }
      await enterWorkspace(await api.workspaceOpen(target));
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
        title: "Choose parent folder",
      });
      if (!parent || Array.isArray(parent)) {
        setBusy(false);
        return;
      }
      await enterWorkspace(
        await api.workspaceCreate(parent, newWorkspaceName),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  /** One line + Enter → thought pool. No type picker. No friction. */
  const captureThought = async () => {
    const title = quickNote.trim();
    if (!title) return;
    setError(null);
    const previous = quickNote;
    setQuickNote(""); // optimistic — keep field free
    try {
      await api.entityCreate({
        entityType: "inbox",
        title,
      });
      await refreshLists();
      quickRef.current?.focus();
    } catch (e) {
      setQuickNote(previous);
      setError(String(e));
      quickRef.current?.focus();
    }
  };

  const sortThought = async (
    entity: Entity,
    entityType: EntityType,
    projectId?: string,
  ) => {
    setBusy(true);
    setError(null);
    try {
      await api.entityUpdate({ id: entity.id, entityType });
      if (projectId) {
        await api.entityLink(projectId, entity.id, "contains");
      }
      if (selectedEntityId === entity.id) {
        // keep detail open on the same item
      }
      await refreshLists();
      showStatus(`→ ${typeLabel(entityType)}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const dismissThought = async (entity: Entity) => {
    setBusy(true);
    try {
      await api.entityUpdate({ id: entity.id, archived: true });
      if (selectedEntityId === entity.id) setSelectedEntityId(null);
      await refreshLists();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const createContact = async () => {
    if (!contactName.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const created = await api.entityCreate({
        entityType: "person",
        title: contactName.trim(),
        description: contactNotes.trim(),
        metadata: withContactMeta({}, contactForm),
        projectId: contactProjectId || undefined,
      });
      setContactName("");
      setContactForm(emptyContactForm());
      setContactNotes("");
      setContactProjectId("");
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

  const createBackupNow = async () => {
    setError(null);
    setBusy(true);
    try {
      const info = await api.backupCreate();
      showStatus(`Backup: ${info.fileName}`);
      await refreshBackups();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async (backup: BackupInfo) => {
    if (
      !window.confirm(
        `Restore ${backup.fileName}? A safety backup of the current data is made first.`,
      )
    ) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const safety = await api.backupRestore(backup.path);
      setSelectedEntityId(null);
      await refreshLists();
      await refreshBackups();
      showStatus(`Restored. Safety: ${safety.fileName}`);
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
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const attachContactToProject = async () => {
    if (!selectedProjectId || !attachPersonId) return;
    setBusy(true);
    try {
      await api.entityLink(selectedProjectId, attachPersonId, "contains");
      setAttachPersonId("");
      setProjectEntities(await api.projectListEntities(selectedProjectId));
      await refreshLists();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const importDocument = async (forProjectId?: string) => {
    setError(null);
    setBusy(true);
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        title: "Import document into workspace",
      });
      if (!picked || Array.isArray(picked)) {
        setBusy(false);
        return;
      }
      const projectId = forProjectId || docProjectId || undefined;
      const doc = await api.documentImport(picked, projectId);
      await refreshLists();
      if (selectedProjectId) {
        setProjectEntities(await api.projectListEntities(selectedProjectId));
      }
      setSelectedEntityId(doc.id);
      showStatus(`Imported: ${doc.fileName}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const openDocumentFile = async (doc: DocumentInfo) => {
    if (!doc.exists) {
      setError("File missing on disk — check Documents folder.");
      return;
    }
    try {
      await openPath(doc.absolutePath);
    } catch (e) {
      setError(String(e));
    }
  };

  const revealDocument = async (doc: DocumentInfo) => {
    if (!doc.exists) {
      setError("File missing on disk.");
      return;
    }
    try {
      await revealItemInDir(doc.absolutePath);
    } catch (e) {
      setError(String(e));
    }
  };

  const openDocumentsFolder = async () => {
    try {
      const folder = await api.documentFolder();
      await openPath(folder);
    } catch (e) {
      setError(String(e));
    }
  };

  const linkDocToProject = async (documentId: string, projectId: string) => {
    if (!projectId) return;
    setBusy(true);
    try {
      await api.documentLinkProject(documentId, projectId);
      await refreshLists();
      if (selectedProjectId) {
        setProjectEntities(await api.projectListEntities(selectedProjectId));
      }
      showStatus("Document linked to project");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const attachDocToSelectedProject = async () => {
    if (!selectedProjectId || !attachDocId) return;
    await linkDocToProject(attachDocId, selectedProjectId);
    setAttachDocId("");
  };

  const detachContact = async (personId: string) => {
    if (!selectedProjectId) return;
    setBusy(true);
    try {
      await api.entityUnlink(selectedProjectId, personId, "contains");
      setProjectEntities(await api.projectListEntities(selectedProjectId));
      await refreshLists();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleEntityChanged = async () => {
    await refreshLists();
    if (selectedProjectId) {
      try {
        setProjectEntities(await api.projectListEntities(selectedProjectId));
      } catch {
        /* ignore */
      }
    }
    if (searchQuery.trim()) {
      try {
        setSearchResults(await api.entitySearch(searchQuery));
      } catch {
        /* ignore */
      }
    }
  };

  const thoughts = useMemo(
    () => entities.filter((e) => e.entityType === "inbox"),
    [entities],
  );

  const openTasks = useMemo(
    () => entities.filter((e) => e.entityType === "task" && !isTaskDone(e)),
    [entities],
  );

  const recentItems = useMemo(
    () =>
      [...entities]
        .filter((e) => e.entityType !== "inbox")
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 10),
    [entities],
  );

  const projectPeople = useMemo(
    () => projectEntities.filter((e) => e.entityType === "person"),
    [projectEntities],
  );

  const projectDocs = useMemo(
    () => projectEntities.filter((e) => e.entityType === "document"),
    [projectEntities],
  );

  const projectWork = useMemo(
    () =>
      projectEntities.filter(
        (e) => e.entityType !== "person" && e.entityType !== "document",
      ),
    [projectEntities],
  );

  const formatSize = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredPeople = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => {
      const c = readContact(p);
      return [p.title, p.description, c.phone, c.email, c.company, c.role]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [people, contactSearch]);

  const renderLinkBadges = (entityId: string) => {
    const badges = badgeMap[entityId];
    if (!badges?.length) return null;
    return (
      <div className="link-badges" aria-label="Related items">
        {badges.map((b) => (
          <span
            key={`${b.direction}-${b.id}`}
            className={`link-badge kind-${b.kind} dir-${b.direction}`}
            title={
              b.direction === "parent"
                ? `In ${typeLabel(b.kind).toLowerCase()}: ${b.label}`
                : `Has ${typeLabel(b.kind).toLowerCase()}: ${b.label}`
            }
          >
            <em>{typeLabel(b.kind)}</em>
            {b.label}
          </span>
        ))}
      </div>
    );
  };

  const renderRow = (e: Entity, opts?: { showToggle?: boolean }) => {
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
              selectedEntityId === e.id ? "entity-row selected" : "entity-row"
            }
            onClick={() => setSelectedEntityId(e.id)}
          >
            <span className={`badge type-${e.entityType}`}>
              {typeLabel(e.entityType)}
            </span>
            <div className="entity-row-body">
              <strong className={done ? "done" : undefined}>{e.title}</strong>
              {e.description && <p>{e.description}</p>}
              {renderLinkBadges(e.id)}
              <small className="muted">{formatRelative(e.updatedAt)}</small>
            </div>
          </button>
        </div>
      </li>
    );
  };

  const quickBar = (
    <div className="quick-bar">
      <input
        ref={quickRef}
        className="quick-input"
        value={quickNote}
        onChange={(e) => setQuickNote(e.target.value)}
        placeholder="ENTER THOUGHT..."
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void captureThought();
          }
        }}
      />
      <button
        type="button"
        className="quick-submit"
        disabled={!quickNote.trim()}
        onClick={() => void captureThought()}
      >
        Add
      </button>
    </div>
  );

  if (!workspace) {
    return (
      <div className="shell welcome">
        <div className="welcome-card">
          <p className="eyebrow">BRAIN_DRIVE_</p>
          <h1>Local notes, tasks, people</h1>
          <p className="lede">
            Dump thoughts fast. Sort later. Everything stays on your machine.
          </p>
          {error && <div className="banner error">{error}</div>}
          <section className="panel">
            <h2>New workspace</h2>
            <label>
              Name
              <input
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
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
              Browse…
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
    <div
      className={
        selectedEntityId ? "shell app compact with-detail" : "shell app compact"
      }
    >
      <header className="topbar">
        <div className="brand compact-brand">
          <strong>BRAIN_</strong>
          <span className="ws-name" title={workspace.path}>
            {workspace.name}
          </span>
        </div>
        <nav className="topnav">
          <button
            className={view === "home" ? "nav active" : "nav"}
            onClick={() => setView("home")}
            title="Home"
          >
            Home
            {thoughts.length > 0 && (
              <span className="nav-count">{thoughts.length}</span>
            )}
          </button>
          <button
            className={view === "projects" ? "nav active" : "nav"}
            onClick={() => setView("projects")}
            title="Projects"
          >
            Proj
          </button>
          <button
            className={view === "people" ? "nav active" : "nav"}
            onClick={() => setView("people")}
            title="People"
          >
            People
          </button>
          <button
            className={view === "docs" ? "nav active" : "nav"}
            onClick={() => setView("docs")}
            title="Documents"
          >
            Docs
          </button>
          <button
            className={view === "search" ? "nav active" : "nav"}
            onClick={() => setView("search")}
            title="Search"
          >
            Find
          </button>
          <button
            className={view === "backups" ? "nav active" : "nav"}
            onClick={() => setView("backups")}
            title="Backups"
          >
            Bak
          </button>
        </nav>
        <div className="topbar-actions">
          <button
            type="button"
            className={alwaysOnTop ? "pin-btn active" : "pin-btn"}
            title={alwaysOnTop ? "Unpin (always on top off)" : "Pin on top"}
            onClick={() => void toggleAlwaysOnTop()}
          >
            {alwaysOnTop ? "PIN" : "pin"}
          </button>
          <button
            type="button"
            className="pin-btn"
            title="Switch workspace"
            onClick={() => {
              setWorkspace(null);
              setEntities([]);
              setProjects([]);
              setPeople([]);
              setSelectedEntityId(null);
              setView("home");
            }}
          >
            ⋯
          </button>
        </div>
      </header>

      <div className="main-column">
        {quickBar}

        <main className="main">
          {error && <div className="banner error">{error}</div>}
          {statusMessage && (
            <div className="banner success">{statusMessage}</div>
          )}

          {view === "home" && (
            <>
              <header className="page-header compact-header">
                <h1>Thoughts_</h1>
                <p>
                  {thoughts.length} unsorted · {openTasks.length} tasks ·{" "}
                  <kbd>/</kbd> capture
                </p>
              </header>

              <section className="panel thought-pool">
                <div className="panel-head">
                  <h2>Pool</h2>
                  <span className="muted">
                    {thoughts.length === 0
                      ? "clear"
                      : `${thoughts.length} waiting`}
                  </span>
                </div>
                {thoughts.length === 0 ? (
                  <p className="empty">No thoughts in pool</p>
                ) : (
                  <ul className="thought-list">
                    {thoughts.map((t) => (
                      <li
                        key={t.id}
                        className={
                          selectedEntityId === t.id
                            ? "thought-item selected"
                            : "thought-item"
                        }
                      >
                        <button
                          type="button"
                          className="thought-title"
                          onClick={() => setSelectedEntityId(t.id)}
                        >
                          <span>{t.title}</span>
                          {renderLinkBadges(t.id)}
                          <small className="muted">
                            {formatRelative(t.updatedAt)}
                          </small>
                        </button>
                        <div className="thought-actions">
                          {SORT_TYPES.map((s) => (
                            <button
                              key={s.value}
                              type="button"
                              className="sort-chip"
                              disabled={busy}
                              title={`Make this a ${s.label.toLowerCase()}`}
                              onClick={() => void sortThought(t, s.value)}
                            >
                              {s.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="sort-chip muted-chip"
                            disabled={busy}
                            onClick={() => void dismissThought(t)}
                          >
                            Dismiss
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {openTasks.length > 0 && (
                <section className="panel">
                  <div className="panel-head">
                    <h2>Open tasks</h2>
                    <span className="muted">{openTasks.length}</span>
                  </div>
                  <ul className="entity-list">
                    {openTasks.map((e) =>
                      renderRow(e, { showToggle: true }),
                    )}
                  </ul>
                </section>
              )}

              {recentItems.length > 0 && (
                <section className="panel">
                  <div className="panel-head">
                    <h2>Recent</h2>
                  </div>
                  <ul className="entity-list">
                    {recentItems.map((e) =>
                      renderRow(e, {
                        showToggle: e.entityType === "task",
                      }),
                    )}
                  </ul>
                </section>
              )}
            </>
          )}

          {view === "projects" && (
            <>
              <header className="page-header">
                <h1>Projects</h1>
                <p>
                  Group notes, tasks, and people. Sort thoughts into a project
                  from Home, or open something and link it.
                </p>
              </header>
              <div className="split">
                <section className="panel">
                  <h2>All projects</h2>
                  {projects.length === 0 ? (
                    <p className="empty">
                      No projects yet. Capture a thought and sort it as
                      Project, or create one from a detail view.
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
                              Open
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
                      ? projects.find((p) => p.id === selectedProjectId)
                          ?.title ?? "Project"
                      : "Select a project"}
                  </h2>
                  {!selectedProjectId ? (
                    <p className="empty">Pick a project on the left.</p>
                  ) : (
                    <>
                      <h3 className="subhead">People</h3>
                      {projectPeople.length === 0 ? (
                        <p className="empty">No one linked yet.</p>
                      ) : (
                        <div className="contact-grid">
                          {projectPeople.map((person) => (
                            <ContactCard
                              key={person.id}
                              person={person}
                              selected={selectedEntityId === person.id}
                              onOpen={() => setSelectedEntityId(person.id)}
                              busy={busy}
                              onDetach={() => void detachContact(person.id)}
                            />
                          ))}
                        </div>
                      )}
                      <div className="row tight attach-row">
                        <select
                          value={attachPersonId}
                          onChange={(e) => setAttachPersonId(e.target.value)}
                        >
                          <option value="">Add person…</option>
                          {people
                            .filter(
                              (p) =>
                                !projectPeople.some((c) => c.id === p.id),
                            )
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.title}
                              </option>
                            ))}
                        </select>
                        <button
                          className="secondary"
                          disabled={busy || !attachPersonId}
                          onClick={() => void attachContactToProject()}
                        >
                          Add
                        </button>
                      </div>
                      <h3 className="subhead">Documents</h3>
                      {projectDocs.length === 0 ? (
                        <p className="empty">No files on this project.</p>
                      ) : (
                        <ul className="entity-list">
                          {projectDocs.map((e) => {
                            const doc = documents.find((d) => d.id === e.id);
                            return (
                              <li key={e.id}>
                                <div className="doc-row">
                                  <button
                                    type="button"
                                    className="entity-row"
                                    onClick={() => setSelectedEntityId(e.id)}
                                  >
                                    <span className="badge type-document">
                                      Doc
                                    </span>
                                    <div className="entity-row-body">
                                      <strong>{e.title}</strong>
                                      <small className="muted">
                                        {doc?.fileName ?? "file"}
                                        {doc
                                          ? ` · ${formatSize(doc.sizeBytes)}`
                                          : ""}
                                        {doc && !doc.exists
                                          ? " · missing"
                                          : ""}
                                      </small>
                                    </div>
                                  </button>
                                  <div className="doc-actions">
                                    {doc && (
                                      <>
                                        <button
                                          type="button"
                                          className="secondary small"
                                          disabled={!doc.exists || busy}
                                          onClick={() =>
                                            void openDocumentFile(doc)
                                          }
                                        >
                                          Open
                                        </button>
                                        <button
                                          type="button"
                                          className="secondary small"
                                          disabled={!doc.exists || busy}
                                          onClick={() =>
                                            void revealDocument(doc)
                                          }
                                        >
                                          Folder
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <div className="row tight attach-row">
                        <select
                          value={attachDocId}
                          onChange={(e) => setAttachDocId(e.target.value)}
                        >
                          <option value="">Link document…</option>
                          {documents
                            .filter(
                              (d) =>
                                !projectDocs.some((p) => p.id === d.id),
                            )
                            .map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.title}
                              </option>
                            ))}
                        </select>
                        <button
                          className="secondary"
                          disabled={busy || !attachDocId}
                          onClick={() => void attachDocToSelectedProject()}
                        >
                          Link
                        </button>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            void importDocument(selectedProjectId ?? undefined)
                          }
                        >
                          Import
                        </button>
                      </div>

                      <h3 className="subhead">Items</h3>
                      {projectWork.length === 0 ? (
                        <p className="empty">Nothing linked to this project.</p>
                      ) : (
                        <ul className="entity-list">
                          {projectWork.map((e) =>
                            renderRow(e, {
                              showToggle: e.entityType === "task",
                            }),
                          )}
                        </ul>
                      )}
                    </>
                  )}
                </section>
              </div>
            </>
          )}

          {view === "docs" && (
            <>
              <header className="page-header compact-header">
                <h1>Documents_</h1>
                <p>
                  Files live in the workspace Documents folder. Link them to
                  projects.
                </p>
              </header>
              <section className="panel">
                <div className="row">
                  <button
                    disabled={busy}
                    onClick={() => void importDocument()}
                  >
                    Import file
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void openDocumentsFolder()}
                  >
                    Open folder
                  </button>
                </div>
                <div className="row tight">
                  <select
                    value={docProjectId}
                    onChange={(e) => setDocProjectId(e.target.value)}
                  >
                    <option value="">Import into project…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="muted">
                  Import copies the file into Documents/. Path is stored and can
                  be attached to any project.
                </p>
              </section>
              <section className="panel">
                <div className="panel-head">
                  <h2>Files</h2>
                  <span className="muted">{documents.length}</span>
                </div>
                {documents.length === 0 ? (
                  <p className="empty">No documents yet</p>
                ) : (
                  <ul className="doc-list">
                    {documents.map((doc) => (
                      <li key={doc.id}>
                        <div className="doc-card">
                          <button
                            type="button"
                            className="doc-card-main"
                            onClick={() => setSelectedEntityId(doc.id)}
                          >
                            <span className="badge type-document">
                              {doc.extension || "file"}
                            </span>
                            <div>
                              <strong>{doc.title}</strong>
                              <small className="muted">
                                {doc.fileName} · {formatSize(doc.sizeBytes)}
                                {!doc.exists ? " · missing on disk" : ""}
                              </small>
                              {doc.projectTitles.length > 0 && (
                                <div className="link-badges">
                                  {doc.projectTitles.map((t) => (
                                    <span
                                      key={t}
                                      className="link-badge kind-project"
                                    >
                                      <em>Project</em>
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </button>
                          <div className="doc-actions">
                            <button
                              type="button"
                              className="secondary small"
                              disabled={!doc.exists || busy}
                              onClick={() => void openDocumentFile(doc)}
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              className="secondary small"
                              disabled={!doc.exists || busy}
                              onClick={() => void revealDocument(doc)}
                            >
                              Folder
                            </button>
                            <select
                              className="doc-link-select"
                              defaultValue=""
                              disabled={busy}
                              onChange={(e) => {
                                const pid = e.target.value;
                                e.target.value = "";
                                if (pid) void linkDocToProject(doc.id, pid);
                              }}
                            >
                              <option value="">+ Project</option>
                              {projects
                                .filter((p) => !doc.projectIds.includes(p.id))
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.title}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}

          {view === "people" && (
            <>
              <header className="page-header">
                <h1>People</h1>
                <p>
                  Phone and email for people you need. Link them to a project
                  so you can reach them from there.
                </p>
              </header>
              <section className="panel">
                <h2>Add person</h2>
                <div className="contact-form-grid">
                  <label>
                    Name
                    <input
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void createContact();
                      }}
                    />
                  </label>
                  <label>
                    Phone
                    <input
                      value={contactForm.phone}
                      onChange={(e) =>
                        setContactForm((c) => ({
                          ...c,
                          phone: e.target.value,
                        }))
                      }
                      inputMode="tel"
                    />
                  </label>
                  <label>
                    Email
                    <input
                      value={contactForm.email}
                      onChange={(e) =>
                        setContactForm((c) => ({
                          ...c,
                          email: e.target.value,
                        }))
                      }
                      inputMode="email"
                    />
                  </label>
                  <label>
                    Company
                    <input
                      value={contactForm.company}
                      onChange={(e) =>
                        setContactForm((c) => ({
                          ...c,
                          company: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Role
                    <input
                      value={contactForm.role}
                      onChange={(e) =>
                        setContactForm((c) => ({
                          ...c,
                          role: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Project
                    <select
                      value={contactProjectId}
                      onChange={(e) => setContactProjectId(e.target.value)}
                    >
                      <option value="">None</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Notes
                  <textarea
                    value={contactNotes}
                    onChange={(e) => setContactNotes(e.target.value)}
                    rows={2}
                  />
                </label>
                <button disabled={busy} onClick={() => void createContact()}>
                  Save
                </button>
              </section>
              <section className="panel">
                <div className="panel-head">
                  <h2>Directory</h2>
                  <span className="muted">{filteredPeople.length}</span>
                </div>
                <input
                  className="contact-search"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Filter…"
                />
                {filteredPeople.length === 0 ? (
                  <p className="empty">No people yet.</p>
                ) : (
                  <div className="contact-grid">
                    {filteredPeople.map((person) => (
                      <ContactCard
                        key={person.id}
                        person={person}
                        selected={selectedEntityId === person.id}
                        onOpen={() => setSelectedEntityId(person.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {view === "search" && (
            <>
              <header className="page-header">
                <h1>Search</h1>
              </header>
              <section className="panel">
                <div className="row">
                  <input
                    className="grow"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search…"
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
                  <p className="empty">No results.</p>
                ) : (
                  <ul className="entity-list">
                    {searchResults.map((e) =>
                      renderRow(e, {
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
                  Copies of your database. Automatic when you open a workspace;
                  keeps the last 10.
                </p>
              </header>
              <section className="panel">
                <div className="row">
                  <button
                    disabled={busy}
                    onClick={() => void createBackupNow()}
                  >
                    Backup now
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void refreshBackups()}
                  >
                    Refresh
                  </button>
                </div>
              </section>
              <section className="panel">
                <div className="panel-head">
                  <h2>Snapshots</h2>
                  <span className="muted">{backups.length}</span>
                </div>
                {backups.length === 0 ? (
                  <p className="empty">No backups yet.</p>
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
      </div>

      {selectedEntityId && (
        <EntityDetail
          entityId={selectedEntityId}
          projects={projects}
          people={people}
          onClose={() => setSelectedEntityId(null)}
          onChanged={() => void handleEntityChanged()}
          onError={(message) => setError(message)}
        />
      )}
    </div>
  );
}

export default App;
