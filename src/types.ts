export type EntityType =
  | "note"
  | "task"
  | "project"
  | "person"
  | "inbox"
  | "document"
  | "event";

export interface WorkspaceInfo {
  name: string;
  path: string;
  schemaVersion: number;
}

export interface Entity {
  id: string;
  entityType: EntityType | string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  version: number;
  archived: boolean;
}

export interface CreateEntityInput {
  entityType: EntityType | string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  projectId?: string;
}

export interface TimelineEvent {
  id: string;
  entityId?: string | null;
  eventType: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface EntityContext {
  entity: Entity;
  containingProjects: Entity[];
  recentEvents: TimelineEvent[];
}

export interface BackupInfo {
  fileName: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export interface LinkBadge {
  kind: string;
  label: string;
  id: string;
  direction: "parent" | "child" | string;
}

export interface EntityBadges {
  entityId: string;
  badges: LinkBadge[];
}

export interface DocumentInfo {
  id: string;
  title: string;
  description: string;
  fileName: string;
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  extension: string;
  exists: boolean;
  createdAt: string;
  updatedAt: string;
  projectIds: string[];
  projectTitles: string[];
  archived: boolean;
}
