import type { Entity, EntityType } from "./types";

/** Product language — internal entity types stay technical. */
export function typeLabel(type: string): string {
  switch (type) {
    case "note":
      return "Note";
    case "task":
      return "Task";
    case "project":
      return "Quest";
    case "person":
      return "Contact";
    case "inbox":
      return "Dump";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

export function typeLabelPlural(type: string): string {
  switch (type) {
    case "note":
      return "Notes";
    case "task":
      return "Tasks";
    case "project":
      return "Quests";
    case "person":
      return "Contacts";
    case "inbox":
      return "Dumps";
    default:
      return typeLabel(type) + "s";
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

export function hasReachableContact(entity: Entity): boolean {
  const c = readContact(entity);
  return Boolean(c.phone || c.email);
}

export const CAPTURE_TYPES: { value: EntityType; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "task", label: "Task" },
  { value: "project", label: "Quest" },
  { value: "person", label: "Contact" },
  { value: "inbox", label: "Dump" },
];

export const FILTER_CHIPS: { value: "all" | EntityType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "note", label: "Notes" },
  { value: "task", label: "Tasks" },
  { value: "person", label: "Contacts" },
  { value: "inbox", label: "Dumps" },
  { value: "project", label: "Quests" },
];
