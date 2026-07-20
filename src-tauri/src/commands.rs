use crate::backup::{self, BackupInfo};
use crate::entity::{
    self, CreateEntityInput, Entity, EntityContext, Relationship, UpdateEntityInput,
};
use crate::error::AppResult;
use crate::state::AppState;
use crate::workspace::{self, WorkspaceInfo};
use tauri::State;

#[tauri::command]
pub fn workspace_create(
    state: State<'_, AppState>,
    parent_dir: String,
    name: String,
) -> AppResult<WorkspaceInfo> {
    workspace::create_workspace(&state, &parent_dir, &name)
}

#[tauri::command]
pub fn workspace_open(state: State<'_, AppState>, path: String) -> AppResult<WorkspaceInfo> {
    workspace::open_workspace(&state, &path)
}

#[tauri::command]
pub fn workspace_current(state: State<'_, AppState>) -> AppResult<Option<WorkspaceInfo>> {
    workspace::current_workspace(&state)
}

#[tauri::command]
pub fn workspace_list_recent() -> AppResult<Vec<String>> {
    workspace::list_recent_workspaces()
}

#[tauri::command]
pub fn backup_create(state: State<'_, AppState>) -> AppResult<BackupInfo> {
    backup::create_backup(&state)
}

#[tauri::command]
pub fn backup_list(state: State<'_, AppState>) -> AppResult<Vec<BackupInfo>> {
    backup::list_backups(&state)
}

#[tauri::command]
pub fn backup_restore(state: State<'_, AppState>, path: String) -> AppResult<BackupInfo> {
    // Returns the safety backup created before restore.
    backup::restore_backup(&state, &path)
}

#[tauri::command]
pub fn entity_create(
    state: State<'_, AppState>,
    input: CreateEntityInput,
) -> AppResult<Entity> {
    entity::create_entity(&state, input)
}

#[tauri::command]
pub fn entity_update(
    state: State<'_, AppState>,
    input: UpdateEntityInput,
) -> AppResult<Entity> {
    entity::update_entity(&state, input)
}

#[tauri::command]
pub fn entity_get(state: State<'_, AppState>, id: String) -> AppResult<Entity> {
    entity::get_entity(&state, &id)
}

#[tauri::command]
pub fn entity_list(
    state: State<'_, AppState>,
    entity_type: Option<String>,
    include_archived: Option<bool>,
    limit: Option<i64>,
) -> AppResult<Vec<Entity>> {
    entity::list_entities(&state, entity_type, include_archived.unwrap_or(false), limit)
}

#[tauri::command]
pub fn entity_search(
    state: State<'_, AppState>,
    query: String,
    limit: Option<i64>,
) -> AppResult<Vec<Entity>> {
    entity::search_entities(&state, &query, limit)
}

#[tauri::command]
pub fn entity_link(
    state: State<'_, AppState>,
    from_entity_id: String,
    to_entity_id: String,
    relationship_type: String,
) -> AppResult<Relationship> {
    entity::link_entities(&state, &from_entity_id, &to_entity_id, &relationship_type)
}

#[tauri::command]
pub fn project_list_entities(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Vec<Entity>> {
    entity::list_project_entities(&state, &project_id)
}

#[tauri::command]
pub fn entity_context(state: State<'_, AppState>, id: String) -> AppResult<EntityContext> {
    entity::get_entity_context(&state, &id)
}

#[tauri::command]
pub fn entity_unlink(
    state: State<'_, AppState>,
    from_entity_id: String,
    to_entity_id: String,
    relationship_type: String,
) -> AppResult<bool> {
    entity::unlink_entities(&state, &from_entity_id, &to_entity_id, &relationship_type)
}
