use crate::db::{open_database, set_setting, validate_connection};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
const WORKSPACE_DB: &str = "workspace.db";
const WORKSPACE_MARKER: &str = "workspace.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub name: String,
    pub path: String,
    pub schema_version: i32,
}

#[derive(Debug, Serialize, Deserialize)]
struct WorkspaceMarker {
    name: String,
    product: String,
    schema_version: i32,
}

pub fn create_workspace(state: &AppState, parent_dir: &str, name: &str) -> AppResult<WorkspaceInfo> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::msg("Workspace name cannot be empty."));
    }

    let parent = PathBuf::from(parent_dir);
    if !parent.is_dir() {
        return Err(AppError::msg("Parent folder does not exist."));
    }

    let workspace_path = parent.join(sanitize_folder_name(name));
    if workspace_path.exists() {
        return Err(AppError::msg(format!(
            "Folder already exists: {}",
            workspace_path.display()
        )));
    }

    fs::create_dir_all(&workspace_path)?;
    for sub in ["Documents", "Attachments", "Backups", "Cache", "Settings", "Plugins"] {
        fs::create_dir_all(workspace_path.join(sub))?;
    }

    let db_path = workspace_path.join(WORKSPACE_DB);
    let conn = open_database(&db_path)?;
    set_setting(&conn, "workspace_name", name)?;

    let marker = WorkspaceMarker {
        name: name.to_string(),
        product: "external-brain-drive".to_string(),
        schema_version: 1,
    };
    fs::write(
        workspace_path.join(WORKSPACE_MARKER),
        serde_json::to_string_pretty(&marker)?,
    )?;

    {
        let mut guard = state
            .db
            .lock()
            .map_err(|_| AppError::msg("Failed to lock database state."))?;
        *guard = Some(conn);
    }
    {
        let mut path_guard = state
            .workspace_path
            .lock()
            .map_err(|_| AppError::msg("Failed to lock workspace path."))?;
        *path_guard = Some(workspace_path.clone());
    }

    remember_recent(&workspace_path)?;

    Ok(WorkspaceInfo {
        name: name.to_string(),
        path: workspace_path.to_string_lossy().to_string(),
        schema_version: 1,
    })
}

pub fn open_workspace(state: &AppState, path: &str) -> AppResult<WorkspaceInfo> {
    let workspace_path = PathBuf::from(path);
    if !workspace_path.is_dir() {
        return Err(AppError::msg("Workspace path is not a folder."));
    }

    let db_path = workspace_path.join(WORKSPACE_DB);
    if !db_path.exists() {
        return Err(AppError::msg(
            "Selected folder is not a workspace (workspace.db not found).",
        ));
    }

    let conn = open_database(&db_path)?;
    validate_connection(&conn)?;

    let name = crate::db::get_setting(&conn, "workspace_name")?
        .or_else(|| read_marker_name(&workspace_path))
        .unwrap_or_else(|| {
            workspace_path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "Workspace".to_string())
        });

    {
        let mut guard = state
            .db
            .lock()
            .map_err(|_| AppError::msg("Failed to lock database state."))?;
        *guard = Some(conn);
    }
    {
        let mut path_guard = state
            .workspace_path
            .lock()
            .map_err(|_| AppError::msg("Failed to lock workspace path."))?;
        *path_guard = Some(workspace_path.clone());
    }

    remember_recent(&workspace_path)?;

    Ok(WorkspaceInfo {
        name,
        path: workspace_path.to_string_lossy().to_string(),
        schema_version: 1,
    })
}

pub fn current_workspace(state: &AppState) -> AppResult<Option<WorkspaceInfo>> {
    let path_guard = state
        .workspace_path
        .lock()
        .map_err(|_| AppError::msg("Failed to lock workspace path."))?;

    let Some(path) = path_guard.as_ref() else {
        return Ok(None);
    };

    let db_guard = state
        .db
        .lock()
        .map_err(|_| AppError::msg("Failed to lock database state."))?;
    let Some(conn) = db_guard.as_ref() else {
        return Ok(None);
    };

    let name = crate::db::get_setting(conn, "workspace_name")?
        .or_else(|| read_marker_name(path))
        .unwrap_or_else(|| "Workspace".to_string());

    Ok(Some(WorkspaceInfo {
        name,
        path: path.to_string_lossy().to_string(),
        schema_version: 1,
    }))
}

pub fn list_recent_workspaces() -> AppResult<Vec<String>> {
    let path = recent_file_path()?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(path)?;
    let list: Vec<String> = serde_json::from_str(&raw).unwrap_or_default();
    Ok(list
        .into_iter()
        .filter(|p| Path::new(p).join(WORKSPACE_DB).exists())
        .collect())
}

fn remember_recent(workspace_path: &Path) -> AppResult<()> {
    let path = recent_file_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut list = list_recent_workspaces().unwrap_or_default();
    let as_string = workspace_path.to_string_lossy().to_string();
    list.retain(|p| p != &as_string);
    list.insert(0, as_string);
    list.truncate(8);
    fs::write(path, serde_json::to_string_pretty(&list)?)?;
    Ok(())
}

fn recent_file_path() -> AppResult<PathBuf> {
    let base = dirs::data_dir().ok_or_else(|| AppError::msg("Could not resolve app data dir."))?;
    Ok(base
        .join("external-brain-drive")
        .join("recent_workspaces.json"))
}

fn read_marker_name(workspace_path: &Path) -> Option<String> {
    let raw = fs::read_to_string(workspace_path.join(WORKSPACE_MARKER)).ok()?;
    let marker: WorkspaceMarker = serde_json::from_str(&raw).ok()?;
    Some(marker.name)
}

fn sanitize_folder_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        "Workspace".to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn with_db<T>(
    state: &AppState,
    f: impl FnOnce(&rusqlite::Connection) -> AppResult<T>,
) -> AppResult<T> {
    let guard = state
        .db
        .lock()
        .map_err(|_| AppError::msg("Failed to lock database state."))?;
    let conn = guard
        .as_ref()
        .ok_or_else(|| AppError::msg("No workspace is open."))?;
    f(conn)
}

