import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { Entity, EntityContext, TimelineEvent } from "./types";

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

interface EntityDetailProps {
  entityId: string;
  projects: Entity[];
  onClose: () => void;
  onChanged: (entity: Entity) => void;
  onError: (message: string) => void;
}

export function EntityDetail({
  entityId,
  projects,
  onClose,
  onChanged,
  onError,
}: EntityDetailProps) {
  const [context, setContext] = useState<EntityContext | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [linkProjectId, setLinkProjectId] = useState("");
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
    return (
      title.trim() !== context.entity.title ||
      description !== context.entity.description
    );
  }, [context, title, description]);

  const entity = context?.entity;

  const save = async () => {
    if (!entity || !title.trim()) {
      onError("Title is required.");
      return;
    }
    setBusy(true);
    try {
      const updated = await api.entityUpdate({
        id: entity.id,
        title: title.trim(),
        description,
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
  }, [entityId, title, description, dirty]);

  const setArchived = async (archived: boolean) => {
    if (!entity) return;
    setBusy(true);
    try {
      if (dirty) {
        await api.entityUpdate({
          id: entity.id,
          title: title.trim() || entity.title,
          description,
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

  const linkedIds = new Set(context?.containingProjects.map((p) => p.id) ?? []);
  const availableProjects = projects.filter((p) => !linkedIds.has(p.id));

  return (
    <aside className="detail-panel" aria-label="Entity detail">
      <div className="detail-head">
        <div>
          {entity && (
            <span className={`badge type-${entity.entityType}`}>
              {typeBadge(entity.entityType)}
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
            Title
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

          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              placeholder="Details, context, decisions…"
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

          {entity.entityType !== "project" && (
            <section className="detail-section">
              <h3>Projects</h3>
              {context?.containingProjects.length === 0 ? (
                <p className="empty">Not linked to any project.</p>
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
