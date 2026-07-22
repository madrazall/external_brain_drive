import type { Entity, EntityType } from "./types";

/** Plain labels — no marketing speak. */
export function typeLabel(type: string): string {
  switch (type) {
    case "note":
      return "Note";
    case "task":
      return "Task";
    case "project":
      return "Project";
    case "person":
      return "Person";
    case "inbox":
      return "Thought";
    case "document":
      return "Doc";
    case "event":
      return "Event";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

export interface ContactInfo {
  phone: string;
  email: string;
  company: string;
  role: string;
}

export function readContact(entity: Entity): ContactInfo {
  const m = entity.metadata ?? {};
  return {
    phone: String(m.phone ?? ""),
    email: String(m.email ?? ""),
    company: String(m.company ?? ""),
    role: String(m.role ?? ""),
  };
}

export function withContactMeta(
  base: Record<string, unknown> | undefined,
  contact: ContactInfo,
): Record<string, unknown> {
  return {
    ...(base ?? {}),
    phone: contact.phone.trim(),
    email: contact.email.trim(),
    company: contact.company.trim(),
    role: contact.role.trim(),
  };
}

export interface EventInfo {
  /** ISO date YYYY-MM-DD */
  date: string;
  /** Optional HH:mm (24h) */
  time: string;
  location: string;
}

export function readEvent(entity: Entity): EventInfo {
  const m = entity.metadata ?? {};
  return {
    date: String(m.date ?? m.eventDate ?? ""),
    time: String(m.time ?? m.eventTime ?? ""),
    location: String(m.location ?? ""),
  };
}

export function withEventMeta(
  base: Record<string, unknown> | undefined,
  event: EventInfo,
): Record<string, unknown> {
  return {
    ...(base ?? {}),
    date: event.date.trim(),
    time: event.time.trim(),
    location: event.location.trim(),
  };
}

/** Format event date for display; empty if no date. */
export function formatEventWhen(entity: Entity): string {
  const e = readEvent(entity);
  if (!e.date) return "";
  try {
    // Parse as local date (avoid UTC shift)
    const [y, m, d] = e.date.split("-").map(Number);
    if (!y || !m || !d) return e.date;
    const dt = new Date(y, m - 1, d);
    const datePart = dt.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return e.time ? `${datePart} · ${e.time}` : datePart;
  } catch {
    return e.time ? `${e.date} · ${e.time}` : e.date;
  }
}

/** Sort key ms for event date+time; far future if missing. */
export function eventSortKey(entity: Entity): number {
  const e = readEvent(entity);
  if (!e.date) return Number.MAX_SAFE_INTEGER;
  const [y, m, d] = e.date.split("-").map(Number);
  if (!y || !m || !d) return Number.MAX_SAFE_INTEGER;
  let hours = 0;
  let mins = 0;
  if (e.time) {
    const parts = e.time.split(":");
    hours = Number(parts[0]) || 0;
    mins = Number(parts[1]) || 0;
  }
  return new Date(y, m - 1, d, hours, mins).getTime();
}

export function isEventPast(entity: Entity, now = Date.now()): boolean {
  const key = eventSortKey(entity);
  if (key === Number.MAX_SAFE_INTEGER) return false;
  // End of event day if no time
  const e = readEvent(entity);
  if (!e.time) {
    const [y, m, d] = e.date.split("-").map(Number);
    return new Date(y, m - 1, d, 23, 59, 59).getTime() < now;
  }
  return key < now;
}

/** Types you can sort a raw thought into. */
export const SORT_TYPES: { value: EntityType; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "task", label: "Task" },
  { value: "event", label: "Event" },
  { value: "project", label: "Project" },
  { value: "person", label: "Person" },
];

/** All types — for reclassifying an existing item. */
export const ALL_TYPES: { value: EntityType; label: string }[] = [
  { value: "inbox", label: "Thought" },
  { value: "note", label: "Note" },
  { value: "task", label: "Task" },
  { value: "event", label: "Event" },
  { value: "project", label: "Project" },
  { value: "person", label: "Person" },
  { value: "document", label: "Doc" },
];
