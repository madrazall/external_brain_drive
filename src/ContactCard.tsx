import { readContact } from "./labels";
import type { Entity } from "./types";

interface ContactCardProps {
  person: Entity;
  selected?: boolean;
  quests?: Entity[];
  onOpen: () => void;
  onDetachFromQuest?: () => void;
  busy?: boolean;
}

export function ContactCard({
  person,
  selected,
  quests,
  onOpen,
  onDetachFromQuest,
  busy,
}: ContactCardProps) {
  const c = readContact(person);
  const subtitle = [c.role, c.company].filter(Boolean).join(" · ");

  return (
    <article className={selected ? "contact-card selected" : "contact-card"}>
      <button type="button" className="contact-card-main" onClick={onOpen}>
        <div className="contact-avatar" aria-hidden>
          {person.title.trim().charAt(0).toUpperCase() || "?"}
        </div>
        <div className="contact-card-body">
          <strong>{person.title}</strong>
          {subtitle && <p className="muted">{subtitle}</p>}
          {c.phone && <p className="contact-line">{c.phone}</p>}
          {c.email && <p className="contact-line">{c.email}</p>}
          {quests && quests.length > 0 && (
            <p className="muted quest-tags">
              {quests.map((q) => q.title).join(" · ")}
            </p>
          )}
        </div>
      </button>
      <div className="reach-actions">
        {c.phone ? (
          <a className="reach-btn primary" href={`tel:${c.phone}`}>
            Call
          </a>
        ) : null}
        {c.email ? (
          <a className="reach-btn" href={`mailto:${c.email}`}>
            Email
          </a>
        ) : null}
        <button type="button" className="reach-btn" onClick={onOpen}>
          Info
        </button>
        {onDetachFromQuest && (
          <button
            type="button"
            className="reach-btn"
            disabled={busy}
            onClick={onDetachFromQuest}
          >
            Unlink
          </button>
        )}
      </div>
    </article>
  );
}
