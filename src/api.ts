import { invoke } from "@tauri-apps/api/core";
import type {
  BackupInfo,
  CreateEntityInput,
  DocumentInfo,
  Entity,
  EntityBadges,
  EntityContext,
  WorkspaceInfo,
} from "./types";

export const api = {
  workspaceCreate: (parentDir: string, name: string) =>
    invoke<WorkspaceInfo>("workspace_create", { parentDir, name }),

  workspaceOpen: (path: string) =>
    invoke<WorkspaceInfo>("workspace_open", { path }),

  workspaceCurrent: () => invoke<WorkspaceInfo | null>("workspace_current"),

  workspaceListRecent: () => invoke<string[]>("workspace_list_recent"),

  backupCreate: () => invoke<BackupInfo>("backup_create"),

  backupList: () => invoke<BackupInfo[]>("backup_list"),

  backupRestore: (path: string) => invoke<BackupInfo>("backup_restore", { path }),

  entityCreate: (input: CreateEntityInput) =>
    invoke<Entity>("entity_create", { input }),

  entityGet: (id: string) => invoke<Entity>("entity_get", { id }),

  entityContext: (id: string) => invoke<EntityContext>("entity_context", { id }),

  entityBadges: () => invoke<EntityBadges[]>("entity_badges"),

  entityList: (entityType?: string, limit = 100) =>
    invoke<Entity[]>("entity_list", {
      entityType: entityType ?? null,
      includeArchived: false,
      limit,
    }),

  entitySearch: (query: string, limit = 50) =>
    invoke<Entity[]>("entity_search", { query, limit }),

  projectListEntities: (projectId: string) =>
    invoke<Entity[]>("project_list_entities", { projectId }),

  entityUpdate: (input: {
    id: string;
    title?: string;
    description?: string;
    metadata?: Record<string, unknown>;
    archived?: boolean;
    entityType?: string;
  }) => invoke<Entity>("entity_update", { input }),

  entityLink: (
    fromEntityId: string,
    toEntityId: string,
    relationshipType: string,
  ) =>
    invoke("entity_link", {
      fromEntityId,
      toEntityId,
      relationshipType,
    }),

  entityUnlink: (
    fromEntityId: string,
    toEntityId: string,
    relationshipType: string,
  ) =>
    invoke<boolean>("entity_unlink", {
      fromEntityId,
      toEntityId,
      relationshipType,
    }),

  documentImport: (
    sourcePath: string,
    projectId?: string,
    title?: string,
  ) =>
    invoke<DocumentInfo>("document_import", {
      sourcePath,
      projectId: projectId ?? null,
      title: title ?? null,
    }),

  documentList: () => invoke<DocumentInfo[]>("document_list"),

  documentGet: (id: string) => invoke<DocumentInfo>("document_get", { id }),

  documentLinkProject: (documentId: string, projectId: string) =>
    invoke<DocumentInfo>("document_link_project", { documentId, projectId }),

  documentUnlinkProject: (documentId: string, projectId: string) =>
    invoke<DocumentInfo>("document_unlink_project", {
      documentId,
      projectId,
    }),

  documentFolder: () => invoke<string>("document_folder"),
};
