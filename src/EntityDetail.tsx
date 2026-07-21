import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import {
  readContact,
  typeLabel,
  withContactMeta,
  type ContactInfo,
} from "./labels";
import type { Entity, EntityContext, TimelineEvent } from "./types";

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
  const [crew, setCrew] = useState<Entity[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedFlash, setSavedFlash] = useState(false);

  const load = async (id: string) => {
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
        const members = await api.projectListEntities(id);
        setCrew(members.filter((m) => m.entityType === "person"));
      } else {
        setCrew([]);
      }
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
      await load(entity.id);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1200);
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, title, description, contact, dirty]);

  const setArchived = async (archived: boolean) => {
    if (!entity) return;
    setBusy(true);
    try {
      if (dirty) {
        await api.entityUpdate({
          id: entity.id,
          title: title.trim() || entity.title,
          description,
          metadata:
            entity.entityType === "person"
              ? withContactMeta(entity.metadata, contact)
              : undefined,
        });
      }
      const updated = await api.entityUpdate({ id: entity.id, archived });
      onChanged(updated);
      if (archived) {
        onClose();
      } else {
        await load(entity.id);
      }
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
      await load(entity.id);
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
      await load(entity.id);
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
      await load(entity.id);
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const attachPersonToQuest = async () => {
    if (!entity || entity.entityType !== "project" || !linkPersonId) return;
    setBusy(true);
    try {
      await api.entityLink(entity.id, linkPersonId, "contains");
      setLinkPersonId("");
      onChanged(entity);
      await load(entity.id);
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
      await load(entity.id);
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
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
          <h2>Details</h2>
        </div>
        <button className="secondary small" onClick={onClose} type="button">
          Close
        </button>
      </div>

      {loading || !entity ? (
        <p className="empty">Loading…</p>
      ) : (
        <>
          <label>
            {entity.entityType === "person" ? "Name" : "Title"}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  void save();
                }
              }}
            />
          </label>

          {entity.entityType === "person" && (
            <section className="detail-section contact-fields">
              <h3>Reach them</h3>
              <label>
                Phone
                <input
                  value={contact.phone}
                  onChange={(e) =>
                    setContact((c) => ({ ...c, phone: e.target.value }))
                  }
                  placeholder="+1 555 0100"
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
                  placeholder="name@example.com"
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
                  placeholder="Org / firm"
                />
              </label>
              <label>
                Role
                <input
                  value={contact.role}
                  onChange={(e) =>
                    setContact((c) => ({ ...c, role: e.target.value }))
                  }
                  placeholder="Title / how they help"
                />
              </label>
              {(contact.phone || contact.email) && (
                <div className="reach-actions">
                  {contact.phone && (
                    <a className="reach-btn" href={`tel:${contact.phone}`}>
                      Call
                    </a>
                  )}
                  {contact.email && (
                    <a className="reach-btn" href={`mailto:${contact.email}`}>
                      Email
                    </a>
                  )}
                </div>
              )}
            </section>
          )}

          <label>
            {entity.entityType === "person" ? "Notes" : "Description"}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={entity.entityType === "person" ? 4 : 8}
              placeholder={
                entity.entityType === "person"
                  ? "How you know them, preferences, last conversation…"
                  : "Details, context, decisions…"
              }
            />
          </label>

          <div className="detail-actions">
            <button disabled={busy || !dirty} onClick={() => void save()}>
              {savedFlash
                ? "Saved"
                : dirty
                  ? "Save changes (Ctrl+S)"
                  : "Saved"}
            </button>
            {entity.entityType === "task" && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void toggleTaskDone()}
              >
                {isTaskDone(entity) ? "Mark open" : "Mark done"}
              </button>
            )}
            <button
              className="secondary danger"
              disabled={busy}
              onClick={() => void setArchived(!entity.archived)}
            >
              {entity.archived ? "Restore" : "Archive"}
            </button>
          </div>

          {entity.entityType === "task" && (
            <p className="muted">
              Status:{" "}
              <strong>{isTaskDone(entity) ? "Done" : "Open"}</strong>
            </p>
          )}

          {entity.entityType === "project" && (
            <section className="detail-section">
              <h3>Crew on this quest</h3>
              {crew.length === 0 ? (
                <p className="empty">No contacts attached yet.</p>
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
                              <a className="reach-btn" href={`tel:${c.phone}`}>
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
                            <button
                              type="button"
                              className="linkish"
                              onClick={() => {
                                /* open this person in detail by bubbling via onChanged pattern — parent owns selection */
                              }}
                              style={{ display: "none" }}
                            />
                          </div>
                        </div>
                        <button
                          className="linkish"
                          type="button"
                          disabled={busy}
                          onClick={() => void detachPerson(person.id)}
                        >
                          Remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {availablePeople.length > 0 && (
                <div className="row tight">
                  <select
                    value={linkPersonId}
                    onChange={(e) => setLinkPersonId(e.target.value)}
                  >
                    <option value="">Attach contact…</option>
                    {availablePeople.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                  <button
                    className="secondary"
                    disabled={busy || !linkPersonId}
                    onClick={() => void attachPersonToQuest()}
                  >
                    Attach
                  </button>
                </div>
              )}
            </section>
          )}

          {entity.entityType !== "project" && (
            <section className="detail-section">
              <h3>Quests</h3>
              {context?.containingProjects.length === 0 ? (
                <p className="empty">Not linked to any quest.</p>
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
                    <option value="">Link to quest…</option>
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
              <div>
                <dt>Version</dt>
                <dd>{entity.version}</dd>
              </div>
            </dl>
          </section>

          <section className="detail-section">
            <h3>Timeline</h3>
            {(context?.recentEvents.length ?? 0) === 0 ? (
              <p className="empty">No events yet.</p>
            ) : (
              <ul className="timeline">
                {context?.recentEvents.map((ev: TimelineEvent) => (
                  <li key={ev.id}>
                    <strong>{ev.summary}</strong>
                    <small className="muted">{formatWhen(ev.createdAt)}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </aside>
  );
}
