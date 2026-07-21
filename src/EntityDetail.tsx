import { useEffect, useMemo, useState } from "react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { api } from "./api";
import {
  ALL_TYPES,
  readContact,
  typeLabel,
  withContactMeta,
  type ContactInfo,
} from "./labels";
import type {
  DocumentInfo,
  Entity,
  EntityContext,
  EntityType,
  TimelineEvent,
} from "./types";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function isTaskDone(entity: Entity): boolean {
  return entity.metadata?.status === "done";
}

interface EntityDetailProps {
  entityId: string;
  projects: Entity[];
  people: Entity[];
  onClose: () => void;
  onChanged: (entity: Entity) => void;
  onError: (message: string) => void;
}

const emptyContact = (): ContactInfo => ({
  phone: "",
  email: "",
  company: "",
  role: "",
});

export function EntityDetail({
  entityId,
  projects,
  people,
  onClose,
  onChanged,
  onError,
}: EntityDetailProps) {
  const [context, setContext] = useState<EntityContext | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState<ContactInfo>(emptyContact());
  const [linkProjectId, setLinkProjectId] = useState("");
  const [linkPersonId, setLinkPersonId] = useState("");
  const [projectMembers, setProjectMembers] = useState<Entity[]>([]);
  const [docInfo, setDocInfo] = useState<DocumentInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const load = async (id: string, keepEditing = false) => {
    setLoading(true);
    try {
      const ctx = await api.entityContext(id);
      setContext(ctx);
      setTitle(ctx.entity.title);
      setDescription(ctx.entity.description);
      if (ctx.entity.entityType === "person") {
        setContact(readContact(ctx.entity));
      } else {
        setContact(emptyContact());
      }
      if (ctx.entity.entityType === "project") {
        setProjectMembers(await api.projectListEntities(id));
      } else {
        setProjectMembers([]);
      }
      if (ctx.entity.entityType === "document") {
        try {
          setDocInfo(await api.documentGet(id));
        } catch {
          setDocInfo(null);
        }
      } else {
        setDocInfo(null);
      }
      if (!keepEditing) setEditing(false);
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(entityId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  const dirty = useMemo(() => {
    if (!context) return false;
    const baseDirty =
      title.trim() !== context.entity.title ||
      description !== context.entity.description;
    if (context.entity.entityType !== "person") return baseDirty;
    const original = readContact(context.entity);
    return (
      baseDirty ||
      contact.phone !== original.phone ||
      contact.email !== original.email ||
      contact.company !== original.company ||
      contact.role !== original.role
    );
  }, [context, title, description, contact]);

  const entity = context?.entity;

  const crew = useMemo(
    () => projectMembers.filter((m) => m.entityType === "person"),
    [projectMembers],
  );
  const docs = useMemo(
    () => projectMembers.filter((m) => m.entityType === "document"),
    [projectMembers],
  );
  const tasks = useMemo(
    () => projectMembers.filter((m) => m.entityType === "task"),
    [projectMembers],
  );
  const notes = useMemo(
    () =>
      projectMembers.filter(
        (m) => m.entityType === "note" || m.entityType === "inbox",
      ),
    [projectMembers],
  );
  const openTaskCount = tasks.filter((t) => !isTaskDone(t)).length;

  const cancelEdit = () => {
    if (!entity) return;
    setTitle(entity.title);
    setDescription(entity.description);
    if (entity.entityType === "person") setContact(readContact(entity));
    setEditing(false);
  };

  const save = async () => {
    if (!entity || !title.trim()) {
      onError("Name / title is required.");
      return;
    }
    setBusy(true);
    try {
      const updated = await api.entityUpdate({
        id: entity.id,
        title: title.trim(),
        description,
        metadata:
          entity.entityType === "person"
            ? withContactMeta(entity.metadata, contact)
            : entity.metadata,
      });
      onChanged(updated);
      await load(entity.id, false);
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editing) {
          e.preventDefault();
          cancelEdit();
        } else {
          onClose();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && editing) {
        e.preventDefault();
        if (dirty) void save();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "e" && !editing) {
        e.preventDefault();
        setEditing(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, editing, dirty, title, description, contact]);

  const setArchived = async (archived: boolean) => {
    if (!entity) return;
    setBusy(true);
    try {
      const updated = await api.entityUpdate({ id: entity.id, archived });
      onChanged(updated);
      if (archived) onClose();
      else await load(entity.id);
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleTaskDone = async () => {
    if (!entity || entity.entityType !== "task") return;
    setBusy(true);
    try {
      const nextStatus = isTaskDone(entity) ? "open" : "done";
      const updated = await api.entityUpdate({
        id: entity.id,
        metadata: { ...entity.metadata, status: nextStatus },
      });
      onChanged(updated);
      await load(entity.id, editing);
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const changeType = async (nextType: EntityType) => {
    if (!entity || nextType === entity.entityType) return;
    setBusy(true);
    try {
      const updated = await api.entityUpdate({
        id: entity.id,
        title: title.trim() || entity.title,
        description,
        entityType: nextType,
        metadata:
          nextType === "person" || entity.entityType === "person"
            ? withContactMeta(entity.metadata, contact)
            : entity.metadata,
      });
      onChanged(updated);
      await load(entity.id, true);
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const linkToProject = async () => {
    if (!entity || !linkProjectId) return;
    setBusy(true);
    try {
      await api.entityLink(linkProjectId, entity.id, "contains");
      setLinkProjectId("");
      onChanged(entity);
      await load(entity.id, editing);
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const unlinkFromProject = async (projectId: string) => {
    if (!entity) return;
    setBusy(true);
    try {
      await api.entityUnlink(projectId, entity.id, "contains");
      onChanged(entity);
      await load(entity.id, editing);
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const attachPerson = async () => {
    if (!entity || entity.entityType !== "project" || !linkPersonId) return;
    setBusy(true);
    try {
      await api.entityLink(entity.id, linkPersonId, "contains");
      setLinkPersonId("");
      onChanged(entity);
      await load(entity.id, editing);
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const detachPerson = async (personId: string) => {
    if (!entity) return;
    setBusy(true);
    try {
      await api.entityUnlink(entity.id, personId, "contains");
      onChanged(entity);
      await load(entity.id, editing);
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const openDoc = async (id: string) => {
    try {
      const d = await api.documentGet(id);
      if (!d.exists) {
        onError("File missing on disk.");
        return;
      }
      await openPath(d.absolutePath);
    } catch (e) {
      onError(String(e));
    }
  };

  const revealDoc = async (id: string) => {
    try {
      const d = await api.documentGet(id);
      if (!d.exists) {
        onError("File missing on disk.");
        return;
      }
      await revealItemInDir(d.absolutePath);
    } catch (e) {
      onError(String(e));
    }
  };

  const linkedIds = new Set(context?.containingProjects.map((p) => p.id) ?? []);
  const availableProjects = projects.filter((p) => !linkedIds.has(p.id));
  const crewIds = new Set(crew.map((c) => c.id));
  const availablePeople = people.filter((p) => !crewIds.has(p.id));

  return (
    <aside className="detail-panel" aria-label="Entity detail">
      <div className="detail-head">
        <div>
          {entity && (
            <span className={`badge type-${entity.entityType}`}>
              {typeLabel(entity.entityType)}
            </span>
          )}
          <h2>{editing ? "Edit" : "Overview"}</h2>
        </div>
        <div className="detail-head-actions">
          {!loading && entity && !editing && (
            <button
              className="secondary small"
              type="button"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          )}
          <button className="secondary small" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </div>

      {loading || !entity ? (
        <p className="empty">Loading…</p>
      ) : editing ? (
        /* ───────────── EDIT MODE ───────────── */
        <>
          <label>
            Type
            <select
              className="type-change"
              value={entity.entityType}
              disabled={busy}
              onChange={(e) => void changeType(e.target.value as EntityType)}
            >
              {ALL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            {entity.entityType === "person" ? "Name" : "Title"}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </label>

          {entity.entityType === "person" && (
            <section className="detail-section contact-fields">
              <h3>Contact</h3>
              <label>
                Phone
                <input
                  value={contact.phone}
                  onChange={(e) =>
                    setContact((c) => ({ ...c, phone: e.target.value }))
                  }
                  inputMode="tel"
                />
              </label>
              <label>
                Email
                <input
                  value={contact.email}
                  onChange={(e) =>
                    setContact((c) => ({ ...c, email: e.target.value }))
                  }
                  inputMode="email"
                />
              </label>
              <label>
                Company
                <input
                  value={contact.company}
                  onChange={(e) =>
                    setContact((c) => ({ ...c, company: e.target.value }))
                  }
                />
              </label>
              <label>
                Role
                <input
                  value={contact.role}
                  onChange={(e) =>
                    setContact((c) => ({ ...c, role: e.target.value }))
                  }
                />
              </label>
            </section>
          )}

          <label>
            {entity.entityType === "person" ? "Notes" : "Description"}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
            />
          </label>

          {entity.entityType === "project" && (
            <section className="detail-section">
              <h3>People</h3>
              {crew.length === 0 ? (
                <p className="empty">None linked</p>
              ) : (
                <ul className="contact-mini-list">
                  {crew.map((person) => (
                    <li key={person.id}>
                      <strong>{person.title}</strong>
                      <button
                        className="linkish"
                        type="button"
                        disabled={busy}
                        onClick={() => void detachPerson(person.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {availablePeople.length > 0 && (
                <div className="row tight">
                  <select
                    value={linkPersonId}
                    onChange={(e) => setLinkPersonId(e.target.value)}
                  >
                    <option value="">Add person…</option>
                    {availablePeople.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                  <button
                    className="secondary"
                    disabled={busy || !linkPersonId}
                    onClick={() => void attachPerson()}
                  >
                    Add
                  </button>
                </div>
              )}
            </section>
          )}

          {entity.entityType !== "project" && (
            <section className="detail-section">
              <h3>Projects</h3>
              {(context?.containingProjects.length ?? 0) === 0 ? (
                <p className="empty">Not linked</p>
              ) : (
                <ul className="chip-list">
                  {context?.containingProjects.map((p) => (
                    <li key={p.id}>
                      <span>{p.title}</span>
                      <button
                        className="linkish"
                        type="button"
                        disabled={busy}
                        onClick={() => void unlinkFromProject(p.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {availableProjects.length > 0 && (
                <div className="row tight">
                  <select
                    value={linkProjectId}
                    onChange={(e) => setLinkProjectId(e.target.value)}
                  >
                    <option value="">Link to project…</option>
                    {availableProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                  <button
                    className="secondary"
                    disabled={busy || !linkProjectId}
                    onClick={() => void linkToProject()}
                  >
                    Link
                  </button>
                </div>
              )}
            </section>
          )}

          <div className="detail-actions">
            <button disabled={busy || !dirty} onClick={() => void save()}>
              Save
            </button>
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={cancelEdit}
            >
              Cancel
            </button>
            <button
              className="secondary danger"
              disabled={busy}
              onClick={() => void setArchived(!entity.archived)}
            >
              {entity.archived ? "Restore" : "Archive"}
            </button>
          </div>
        </>
      ) : (
        /* ───────────── VIEW MODE ───────────── */
        <>
          <div className="view-hero">
            <h1 className="view-title">{entity.title}</h1>
            {entity.entityType === "task" && (
              <p className="view-status">
                {isTaskDone(entity) ? "Done" : "Open"}
              </p>
            )}
            {entity.entityType === "project" && (
              <p className="view-status">
                {openTaskCount} open · {tasks.length} tasks · {docs.length} docs
                · {crew.length} people
              </p>
            )}
          </div>

          {entity.description ? (
            <p className="view-body">{entity.description}</p>
          ) : (
            <p className="view-body muted">No description.</p>
          )}

          {entity.entityType === "person" && (
            <section className="detail-section">
              <h3>Contact</h3>
              {(() => {
                const c = readContact(entity);
                return (
                  <>
                    <dl className="meta-grid">
                      {c.role && (
                        <div>
                          <dt>Role</dt>
                          <dd>{c.role}</dd>
                        </div>
                      )}
                      {c.company && (
                        <div>
                          <dt>Company</dt>
                          <dd>{c.company}</dd>
                        </div>
                      )}
                      {c.phone && (
                        <div>
                          <dt>Phone</dt>
                          <dd>{c.phone}</dd>
                        </div>
                      )}
                      {c.email && (
                        <div>
                          <dt>Email</dt>
                          <dd>{c.email}</dd>
                        </div>
                      )}
                      {!c.phone && !c.email && !c.company && !c.role && (
                        <p className="empty">No contact details yet</p>
                      )}
                    </dl>
                    {(c.phone || c.email) && (
                      <div className="reach-actions compact">
                        {c.phone && (
                          <a className="reach-btn primary" href={`tel:${c.phone}`}>
                            Call
                          </a>
                        )}
                        {c.email && (
                          <a className="reach-btn" href={`mailto:${c.email}`}>
                            Email
                          </a>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </section>
          )}

          {entity.entityType === "document" && (
            <section className="detail-section">
              <h3>File</h3>
              <p className="muted">
                {docInfo?.fileName ??
                  String(entity.metadata?.fileName ?? "—")}
                {docInfo?.relativePath
                  ? ` · ${docInfo.relativePath}`
                  : entity.metadata?.relativePath
                    ? ` · ${String(entity.metadata.relativePath)}`
                    : ""}
                {docInfo && !docInfo.exists ? " · missing" : ""}
              </p>
              <div className="detail-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || (docInfo ? !docInfo.exists : false)}
                  onClick={() => void openDoc(entity.id)}
                >
                  Open file
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || (docInfo ? !docInfo.exists : false)}
                  onClick={() => void revealDoc(entity.id)}
                >
                  Show in folder
                </button>
              </div>
            </section>
          )}

          {entity.entityType === "task" && (
            <div className="detail-actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void toggleTaskDone()}
              >
                {isTaskDone(entity) ? "Mark open" : "Mark done"}
              </button>
            </div>
          )}

          {entity.entityType === "project" && (
            <>
              <section className="detail-section">
                <h3>People</h3>
                {crew.length === 0 ? (
                  <p className="empty">No people linked</p>
                ) : (
                  <ul className="contact-mini-list">
                    {crew.map((person) => {
                      const c = readContact(person);
                      return (
                        <li key={person.id}>
                          <div>
                            <strong>{person.title}</strong>
                            {(c.role || c.company) && (
                              <small className="muted">
                                {[c.role, c.company].filter(Boolean).join(" · ")}
                              </small>
                            )}
                            <div className="reach-actions compact">
                              {c.phone && (
                                <a
                                  className="reach-btn primary"
                                  href={`tel:${c.phone}`}
                                >
                                  Call
                                </a>
                              )}
                              {c.email && (
                                <a
                                  className="reach-btn"
                                  href={`mailto:${c.email}`}
                                >
                                  Email
                                </a>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="detail-section">
                <h3>Documents</h3>
                {docs.length === 0 ? (
                  <p className="empty">No documents</p>
                ) : (
                  <ul className="view-list">
                    {docs.map((d) => (
                      <li key={d.id}>
                        <span>{d.title}</span>
                        <button
                          type="button"
                          className="secondary small"
                          onClick={() => void openDoc(d.id)}
                        >
                          Open
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="detail-section">
                <h3>Tasks</h3>
                {tasks.length === 0 ? (
                  <p className="empty">No tasks</p>
                ) : (
                  <ul className="view-list">
                    {tasks.map((t) => (
                      <li key={t.id}>
                        <span className={isTaskDone(t) ? "done" : undefined}>
                          {t.title}
                        </span>
                        <span className="muted">
                          {isTaskDone(t) ? "done" : "open"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {notes.length > 0 && (
                <section className="detail-section">
                  <h3>Notes</h3>
                  <ul className="view-list">
                    {notes.map((n) => (
                      <li key={n.id}>
                        <span>{n.title}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {entity.entityType !== "project" &&
            (context?.containingProjects.length ?? 0) > 0 && (
              <section className="detail-section">
                <h3>Projects</h3>
                <ul className="view-list">
                  {context?.containingProjects.map((p) => (
                    <li key={p.id}>
                      <span>{p.title}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

          <section className="detail-section">
            <h3>Meta</h3>
            <dl className="meta-grid">
              <div>
                <dt>Created</dt>
                <dd>{formatWhen(entity.createdAt)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatWhen(entity.updatedAt)}</dd>
              </div>
            </dl>
          </section>

          {(context?.recentEvents.length ?? 0) > 0 && (
            <section className="detail-section">
              <h3>Recent activity</h3>
              <ul className="timeline">
                {context?.recentEvents.slice(0, 5).map((ev: TimelineEvent) => (
                  <li key={ev.id}>
                    <strong>{ev.summary}</strong>
                    <small className="muted">{formatWhen(ev.createdAt)}</small>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {entity.archived && (
            <div className="detail-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => void setArchived(false)}
              >
                Restore
              </button>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
