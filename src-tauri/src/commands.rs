use crate::backup::{self, BackupInfo};
use crate::document::{self, DocumentInfo};
use crate::entity::{
    self, CreateEntityInput, Entity, EntityBadges, EntityContext, Relationship,
    UpdateEntityInput,
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
pub fn entity_badges(state: State<'_, AppState>) -> AppResult<Vec<EntityBadges>> {
    entity::list_entity_badges(&state)
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

#[tauri::command]
pub fn document_import(
    state: State<'_, AppState>,
    source_path: String,
    project_id: Option<String>,
    title: Option<String>,
) -> AppResult<DocumentInfo> {
    document::import_document(&state, &source_path, project_id, title)
}

#[tauri::command]
pub fn document_list(state: State<'_, AppState>) -> AppResult<Vec<DocumentInfo>> {
    document::list_documents(&state)
}

#[tauri::command]
pub fn document_get(state: State<'_, AppState>, id: String) -> AppResult<DocumentInfo> {
    document::get_document(&state, &id)
}

#[tauri::command]
pub fn document_link_project(
    state: State<'_, AppState>,
    document_id: String,
    project_id: String,
) -> AppResult<DocumentInfo> {
    document::link_document_to_project(&state, &document_id, &project_id)
}

#[tauri::command]
pub fn document_unlink_project(
    state: State<'_, AppState>,
    document_id: String,
    project_id: String,
) -> AppResult<DocumentInfo> {
    document::unlink_document_from_project(&state, &document_id, &project_id)
}

#[tauri::command]
pub fn document_folder(state: State<'_, AppState>) -> AppResult<String> {
    document::documents_folder_path(&state)
}

#[tauri::command]
pub fn document_register(
    state: State<'_, AppState>,
    path: String,
    project_id: Option<String>,
    title: Option<String>,
) -> AppResult<DocumentInfo> {
    document::register_document(&state, &path, project_id, title)
}
