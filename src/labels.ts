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

/** Types you can sort a raw thought into. */
export const SORT_TYPES: { value: EntityType; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "task", label: "Task" },
  { value: "project", label: "Project" },
  { value: "person", label: "Person" },
];

/** All types — for reclassifying an existing item. */
export const ALL_TYPES: { value: EntityType; label: string }[] = [
  { value: "inbox", label: "Thought" },
  { value: "note", label: "Note" },
  { value: "task", label: "Task" },
  { value: "project", label: "Project" },
  { value: "person", label: "Person" },
];
