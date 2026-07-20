export type EntityType = "note" | "task" | "project" | "person" | "inbox";

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
