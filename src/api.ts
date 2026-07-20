import { invoke } from "@tauri-apps/api/core";
import type { CreateEntityInput, Entity, WorkspaceInfo } from "./types";

export const api = {
  workspaceCreate: (parentDir: string, name: string) =>
    invoke<WorkspaceInfo>("workspace_create", { parentDir, name }),

  workspaceOpen: (path: string) =>
    invoke<WorkspaceInfo>("workspace_open", { path }),

  workspaceCurrent: () => invoke<WorkspaceInfo | null>("workspace_current"),

  workspaceListRecent: () => invoke<string[]>("workspace_list_recent"),

  entityCreate: (input: CreateEntityInput) =>
    invoke<Entity>("entity_create", { input }),

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
    archived?: boolean;
  }) => invoke<Entity>("entity_update", { input }),
};
