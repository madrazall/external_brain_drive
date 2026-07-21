import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "./api";
import { ContactCard } from "./ContactCard";
import { EntityDetail } from "./EntityDetail";
import {
  CAPTURE_TYPES,
  FILTER_CHIPS,
  readContact,
  typeLabel,
  withContactMeta,
  type ContactInfo,
} from "./labels";
import type { BackupInfo, Entity, EntityType, WorkspaceInfo } from "./types";
import "./App.css";

type View =
  | "focus"
  | "inbox"
  | "projects"
  | "contacts"
  | "search"
  | "backups";

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

  // Contact Center form
  const [contactName, setContactName] = useState("");
  const [contactForm, setContactForm] = useState<ContactInfo>(emptyContactForm());
  const [contactNotes, setContactNotes] = useState("");
  const [contactQuestId, setContactQuestId] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [attachPersonId, setAttachPersonId] = useState("");

  const titleInputRef = useRef<HTMLInputElement>(null);

  const refreshLists = useCallback(async () => {
    const [all, projectList, peopleList] = await Promise.all([
      api.entityList(undefined, 300),
      api.entityList("project", 100),
      api.entityList("person", 300),
    ]);
    setEntities(all);
    setProjects(projectList);
    setPeople(peopleList);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedEntityId) {
        setSelectedEntityId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedEntityId]);

  useEffect(() => {
    if (workspace && (view === "focus" || view === "inbox")) {
      const t = window.setTimeout(() => titleInputRef.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [workspace, view]);

  const enterWorkspace = async (info: WorkspaceInfo) => {
    setWorkspace(info);
    setSelectedEntityId(null);
    setView("focus");
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
      showStatus(`Got it — ${typeLabel(created.entityType)}: ${created.title}`);
      window.setTimeout(() => titleInputRef.current?.focus(), 30);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const createContact = async () => {
    if (!contactName.trim()) {
      setError("Contact name is required.");
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
        projectId: contactQuestId || undefined,
      });
      setContactName("");
      setContactForm(emptyContactForm());
      setContactNotes("");
      setContactQuestId("");
      await refreshLists();
      setSelectedEntityId(created.id);
      showStatus(`Contact saved: ${created.title}`);
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

  const attachContactToQuest = async () => {
    if (!selectedProjectId || !attachPersonId) return;
    setBusy(true);
    try {
      await api.entityLink(selectedProjectId, attachPersonId, "contains");
      setAttachPersonId("");
      setProjectEntities(await api.projectListEntities(selectedProjectId));
      await refreshLists();
      showStatus("Contact attached to quest");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const detachContactFromQuest = async (personId: string) => {
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
        // ignore
      }
    }
    if (searchQuery.trim()) {
      try {
        setSearchResults(await api.entitySearch(searchQuery));
      } catch {
        // ignore
      }
    }
  };

  const openTasks = useMemo(
    () => entities.filter((e) => e.entityType === "task" && !isTaskDone(e)),
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
    if (inboxFilter === "all") {
      return entities.filter((e) => e.entityType !== "project");
    }
    return entities.filter((e) => e.entityType === inboxFilter);
  }, [entities, inboxFilter]);

  const questCrew = useMemo(
    () => projectEntities.filter((e) => e.entityType === "person"),
    [projectEntities],
  );

  const questWork = useMemo(
    () => projectEntities.filter((e) => e.entityType !== "person"),
    [projectEntities],
  );

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => {
      const c = readContact(p);
      const hay = [
        p.title,
        p.description,
        c.phone,
        c.email,
        c.company,
        c.role,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [people, contactSearch]);

  /** Map person id → quests they belong to (from currently loaded project memberships is incomplete).
   *  We approximate via each person's containing projects when detail loads;
   *  for list, show nothing unless we fetch — skip per-person quests for list speed. */
  const stats = useMemo(
    () => ({
      total: entities.length,
      tasksOpen: openTasks.length,
      contacts: people.length,
      quests: projects.length,
    }),
    [entities.length, openTasks.length, people.length, projects.length],
  );

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
              {e.entityType === "person" && (() => {
                const c = readContact(e);
                const bits = [c.phone, c.email].filter(Boolean);
                return bits.length ? (
                  <p className="contact-line">{bits.join(" · ")}</p>
                ) : null;
              })()}
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
          aria-label="Type"
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
          placeholder="Drop it here — Enter to save"
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
        placeholder="Optional details…"
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
          <option value="">No quest</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <button disabled={busy} onClick={() => void capture()}>
          Get This
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
            Capture chaos, run quests, reach people fast — all offline, on your
            machine.
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
            Right Now
          </button>
          <button
            className={view === "inbox" ? "nav active" : "nav"}
            onClick={() => setView("inbox")}
          >
            Get This
          </button>
          <button
            className={view === "projects" ? "nav active" : "nav"}
            onClick={() => setView("projects")}
          >
            Quests
          </button>
          <button
            className={view === "contacts" ? "nav active" : "nav"}
            onClick={() => setView("contacts")}
          >
            Contact Center
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
          <span>{stats.contacts} contacts</span>
          <span>{stats.quests} quests</span>
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
              setPeople([]);
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
              <h1>Right Now</h1>
              <p>
                Open tasks and what you just touched. Dump chaos below —{" "}
                <kbd>Enter</kbd> locks it in.
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
                    Nothing on fire. Capture a <strong>Task</strong> when
                    something is.
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
                  <p className="empty">Blank slate. Get something in.</p>
                ) : (
                  <ul className="entity-list">
                    {recentlyTouched.map((e) =>
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

        {view === "inbox" && (
          <>
            <header className="page-header">
              <h1>Get This</h1>
              <p>
                Capture before it escapes. <kbd>Enter</kbd> saves ·{" "}
                <kbd>Esc</kbd> closes detail.
              </p>
            </header>

            {capturePanel}

            <section className="panel">
              <div className="panel-head">
                <h2>Everything in</h2>
                <span className="muted">{inboxItems.length}</span>
              </div>
              <div className="chip-row">
                {FILTER_CHIPS.map((chip) => (
                  <button
                    key={chip.value}
                    type="button"
                    className={
                      inboxFilter === chip.value ? "chip active" : "chip"
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
              <h1>Quests &amp; Side Quests</h1>
              <p>
                Big missions and the little ones that support them. Attach crew
                for one-tap call / email when it gets urgent.
              </p>
            </header>

            <div className="split">
              <section className="panel">
                <h2>All quests</h2>
                {projects.length === 0 ? (
                  <p className="empty">
                    Start a quest from <strong>Get This</strong> (type Quest).
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
                      "Quest"
                    : "Select a quest"}
                </h2>
                {!selectedProjectId ? (
                  <p className="empty">Pick a quest to see work and crew.</p>
                ) : (
                  <>
                    <h3 className="subhead">Crew — reach fast</h3>
                    {questCrew.length === 0 ? (
                      <p className="empty">
                        No contacts on this quest yet. Attach one below or from
                        Contact Center.
                      </p>
                    ) : (
                      <div className="contact-grid">
                        {questCrew.map((person) => (
                          <ContactCard
                            key={person.id}
                            person={person}
                            selected={selectedEntityId === person.id}
                            onOpen={() => setSelectedEntityId(person.id)}
                            busy={busy}
                            onDetachFromQuest={() =>
                              void detachContactFromQuest(person.id)
                            }
                          />
                        ))}
                      </div>
                    )}

                    <div className="row tight attach-row">
                      <select
                        value={attachPersonId}
                        onChange={(e) => setAttachPersonId(e.target.value)}
                      >
                        <option value="">Attach contact…</option>
                        {people
                          .filter(
                            (p) => !questCrew.some((c) => c.id === p.id),
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
                        onClick={() => void attachContactToQuest()}
                      >
                        Attach
                      </button>
                    </div>

                    <h3 className="subhead">Work on this quest</h3>
                    {questWork.length === 0 ? (
                      <p className="empty">
                        No notes/tasks linked. Capture with this quest
                        selected.
                      </p>
                    ) : (
                      <ul className="entity-list">
                        {questWork.map((e) =>
                          renderEntityRow(e, {
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

        {view === "contacts" && (
          <>
            <header className="page-header">
              <h1>Contact Center</h1>
              <p>
                People you need on speed dial. Attach them to quests — when
                you&apos;re in the thick of it, one click calls or emails.
              </p>
            </header>

            <section className="panel">
              <h2>Add contact</h2>
              <div className="contact-form-grid">
                <label>
                  Name *
                  <input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Who are they?"
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
                      setContactForm((c) => ({ ...c, phone: e.target.value }))
                    }
                    placeholder="+1 555 0100"
                    inputMode="tel"
                  />
                </label>
                <label>
                  Email
                  <input
                    value={contactForm.email}
                    onChange={(e) =>
                      setContactForm((c) => ({ ...c, email: e.target.value }))
                    }
                    placeholder="name@example.com"
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
                    placeholder="Org"
                  />
                </label>
                <label>
                  Role
                  <input
                    value={contactForm.role}
                    onChange={(e) =>
                      setContactForm((c) => ({ ...c, role: e.target.value }))
                    }
                    placeholder="How they help"
                  />
                </label>
                <label>
                  Attach to quest
                  <select
                    value={contactQuestId}
                    onChange={(e) => setContactQuestId(e.target.value)}
                  >
                    <option value="">None yet</option>
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
                  placeholder="Context, last talk, preference…"
                />
              </label>
              <button disabled={busy} onClick={() => void createContact()}>
                Save contact
              </button>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>Directory</h2>
                <span className="muted">{filteredContacts.length}</span>
              </div>
              <input
                className="contact-search"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Filter by name, phone, email, company…"
              />
              {filteredContacts.length === 0 ? (
                <p className="empty">
                  No contacts yet. Add someone above — future-you will thank
                  you.
                </p>
              ) : (
                <div className="contact-grid">
                  {filteredContacts.map((person) => (
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
              <p>Full-text over titles and descriptions. (Cooler name TBD.)</p>
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
                Local snapshots of <code>workspace.db</code>. Auto on open; last
                10 kept. (Still looking for a cooler name.)
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
                first.
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
