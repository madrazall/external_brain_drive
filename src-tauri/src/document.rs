use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::workspace::with_db;
use chrono::{SecondsFormat, Utc};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const DOCS_DIR: &str = "Documents";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentInfo {
    pub id: String,
    pub title: String,
    pub description: String,
    pub file_name: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub size_bytes: u64,
    pub extension: String,
    pub exists: bool,
    pub created_at: String,
    pub updated_at: String,
    pub project_ids: Vec<String>,
    pub project_titles: Vec<String>,
    pub archived: bool,
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn workspace_path(state: &AppState) -> AppResult<PathBuf> {
    state
        .workspace_path
        .lock()
        .map_err(|_| AppError::msg("Failed to lock workspace path."))?
        .clone()
        .ok_or_else(|| AppError::msg("No workspace is open."))
}

fn documents_dir(workspace: &Path) -> PathBuf {
    workspace.join(DOCS_DIR)
}

fn unique_dest(dir: &Path, file_name: &str) -> PathBuf {
    let dest = dir.join(file_name);
    if !dest.exists() {
        return dest;
    }
    let stem = Path::new(file_name)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".into());
    let ext = Path::new(file_name)
        .extension()
        .map(|s| format!(".{}", s.to_string_lossy()))
        .unwrap_or_default();
    for i in 1..1000 {
        let candidate = dir.join(format!("{stem}-{i}{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!(
        "{stem}-{}{ext}",
        Utc::now().timestamp_millis()
    ))
}

fn extension_of(path: &Path) -> String {
    path.extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

/// Import a file into workspace/Documents and create a document entity.
pub fn import_document(
    state: &AppState,
    source_path: &str,
    project_id: Option<String>,
    title: Option<String>,
) -> AppResult<DocumentInfo> {
    let source = PathBuf::from(source_path);
    if !source.is_file() {
        return Err(AppError::msg("Source path is not a file."));
    }

    let workspace = workspace_path(state)?;
    let docs = documents_dir(&workspace);
    fs::create_dir_all(&docs)?;

    let file_name = source
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .ok_or_else(|| AppError::msg("Invalid file name."))?;

    let dest = unique_dest(&docs, &file_name);
    fs::copy(&source, &dest)?;

    let rel = format!(
        "{DOCS_DIR}/{}",
        dest.file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or(file_name.clone())
    );
    let size = fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
    let ext = extension_of(&dest);
    let display_title = title
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| {
            dest.file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or(file_name.clone())
        });

    let id = Uuid::new_v4().to_string();
    let ts = now();
    let metadata = serde_json::json!({
        "relativePath": rel,
        "fileName": dest.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or(file_name),
        "sizeBytes": size,
        "extension": ext,
        "importedFrom": source_path,
    });

    with_db(state, |conn| {
        conn.execute(
            r#"
            INSERT INTO entities (
                id, entity_type, title, description, metadata,
                created_at, updated_at, version, archived
            ) VALUES (?1, 'document', ?2, '', ?3, ?4, ?5, 1, 0)
            "#,
            params![id, display_title, metadata.to_string(), ts, ts],
        )?;

        conn.execute(
            r#"
            INSERT INTO timeline_events (id, entity_id, event_type, summary, payload, created_at)
            VALUES (?1, ?2, 'document.imported', ?3, ?4, ?5)
            "#,
            params![
                Uuid::new_v4().to_string(),
                id,
                format!("Imported document: {display_title}"),
                serde_json::json!({ "relativePath": rel }).to_string(),
                ts
            ],
        )?;

        if let Some(ref pid) = project_id {
            let exists: Option<String> = conn
                .query_row(
                    "SELECT id FROM entities WHERE id = ?1 AND entity_type = 'project' AND archived = 0",
                    params![pid],
                    |row| row.get(0),
                )
                .optional()?;
            if exists.is_none() {
                return Err(AppError::msg("Project not found."));
            }
            conn.execute(
                r#"
                INSERT INTO relationships (
                    id, from_entity_id, to_entity_id, relationship_type, created_at
                ) VALUES (?1, ?2, ?3, 'contains', ?4)
                ON CONFLICT(from_entity_id, to_entity_id, relationship_type) DO NOTHING
                "#,
                params![Uuid::new_v4().to_string(), pid, id, ts],
            )?;
        }

        Ok(())
    })?;

    get_document(state, &id)
}

/// Register a file already under workspace/Documents (no copy).
pub fn register_document(
    state: &AppState,
    relative_or_absolute: &str,
    project_id: Option<String>,
    title: Option<String>,
) -> AppResult<DocumentInfo> {
    let workspace = workspace_path(state)?;
    let path = PathBuf::from(relative_or_absolute);
    let abs = if path.is_absolute() {
        path
    } else {
        workspace.join(&path)
    };

    if !abs.is_file() {
        return Err(AppError::msg("File not found."));
    }

    // Must live under Documents/
    let docs = documents_dir(&workspace)
        .canonicalize()
        .map_err(|_| AppError::msg("Documents folder missing."))?;
    let abs_canon = abs
        .canonicalize()
        .map_err(|_| AppError::msg("Could not resolve file path."))?;
    if !abs_canon.starts_with(&docs) {
        return Err(AppError::msg(
            "File must be inside this workspace's Documents folder. Use Import to copy it in.",
        ));
    }

    let rel = path_relative_to_workspace(&workspace, &abs_canon)?;
    let file_name = abs_canon
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    // Avoid duplicate registration of same relative path
    if let Some(existing) = find_by_relative_path(state, &rel)? {
        if let Some(pid) = project_id {
            crate::entity::link_entities(state, &pid, &existing, "contains")?;
        }
        return get_document(state, &existing);
    }

    let size = fs::metadata(&abs_canon).map(|m| m.len()).unwrap_or(0);
    let ext = extension_of(&abs_canon);
    let display_title = title
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| {
            abs_canon
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or(file_name.clone())
        });

    let id = Uuid::new_v4().to_string();
    let ts = now();
    let metadata = serde_json::json!({
        "relativePath": rel,
        "fileName": file_name,
        "sizeBytes": size,
        "extension": ext,
    });

    with_db(state, |conn| {
        conn.execute(
            r#"
            INSERT INTO entities (
                id, entity_type, title, description, metadata,
                created_at, updated_at, version, archived
            ) VALUES (?1, 'document', ?2, '', ?3, ?4, ?5, 1, 0)
            "#,
            params![id, display_title, metadata.to_string(), ts, ts],
        )?;
        if let Some(ref pid) = project_id {
            conn.execute(
                r#"
                INSERT INTO relationships (
                    id, from_entity_id, to_entity_id, relationship_type, created_at
                ) VALUES (?1, ?2, ?3, 'contains', ?4)
                ON CONFLICT(from_entity_id, to_entity_id, relationship_type) DO NOTHING
                "#,
                params![Uuid::new_v4().to_string(), pid, id, ts],
            )?;
        }
        Ok(())
    })?;

    get_document(state, &id)
}

pub fn list_documents(state: &AppState) -> AppResult<Vec<DocumentInfo>> {
    let workspace = workspace_path(state)?;
    let rows: Vec<(String, String, String, String, String, String, i64, i64)> =
        with_db(state, |conn| {
            let mut stmt = conn.prepare(
                r#"
                SELECT id, title, description, metadata, created_at, updated_at, version, archived
                FROM entities
                WHERE entity_type = 'document' AND archived = 0
                ORDER BY updated_at DESC
                "#,
            )?;
            let mapped = stmt.query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                ))
            })?;
            let mut out = Vec::new();
            for r in mapped {
                out.push(r?);
            }
            Ok(out)
        })?;

    let mut docs = Vec::new();
    for (id, title, description, metadata_raw, created_at, updated_at, _version, archived) in rows
    {
        let meta: serde_json::Value =
            serde_json::from_str(&metadata_raw).unwrap_or(serde_json::json!({}));
        let relative_path = meta
            .get("relativePath")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let file_name = meta
            .get("fileName")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let size_bytes = meta
            .get("sizeBytes")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let extension = meta
            .get("extension")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let absolute_path = if relative_path.is_empty() {
            String::new()
        } else {
            workspace.join(&relative_path).to_string_lossy().to_string()
        };
        let exists = !absolute_path.is_empty() && Path::new(&absolute_path).is_file();
        let (project_ids, project_titles) = projects_for(state, &id)?;

        docs.push(DocumentInfo {
            id,
            title,
            description,
            file_name,
            relative_path,
            absolute_path,
            size_bytes,
            extension,
            exists,
            created_at,
            updated_at,
            project_ids,
            project_titles,
            archived: archived != 0,
        });
    }
    Ok(docs)
}

pub fn get_document(state: &AppState, id: &str) -> AppResult<DocumentInfo> {
    list_documents(state)?
        .into_iter()
        .find(|d| d.id == id)
        .ok_or_else(|| AppError::msg("Document not found."))
}

pub fn link_document_to_project(
    state: &AppState,
    document_id: &str,
    project_id: &str,
) -> AppResult<DocumentInfo> {
    // Ensure document exists
    let _ = get_document(state, document_id)?;
    crate::entity::link_entities(state, project_id, document_id, "contains")?;
    get_document(state, document_id)
}

pub fn unlink_document_from_project(
    state: &AppState,
    document_id: &str,
    project_id: &str,
) -> AppResult<DocumentInfo> {
    crate::entity::unlink_entities(state, project_id, document_id, "contains")?;
    get_document(state, document_id)
}

pub fn documents_folder_path(state: &AppState) -> AppResult<String> {
    let workspace = workspace_path(state)?;
    let docs = documents_dir(&workspace);
    fs::create_dir_all(&docs)?;
    Ok(docs.to_string_lossy().to_string())
}

fn path_relative_to_workspace(workspace: &Path, abs: &Path) -> AppResult<String> {
    let rel = abs
        .strip_prefix(workspace)
        .map_err(|_| AppError::msg("Path is outside workspace."))?;
    Ok(rel.to_string_lossy().replace('\\', "/"))
}

fn find_by_relative_path(state: &AppState, rel: &str) -> AppResult<Option<String>> {
    with_db(state, |conn| {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, metadata FROM entities
            WHERE entity_type = 'document' AND archived = 0
            "#,
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (id, meta_raw) = row?;
            let meta: serde_json::Value =
                serde_json::from_str(&meta_raw).unwrap_or(serde_json::json!({}));
            if meta.get("relativePath").and_then(|v| v.as_str()) == Some(rel) {
                return Ok(Some(id));
            }
        }
        Ok(None)
    })
}

fn projects_for(state: &AppState, doc_id: &str) -> AppResult<(Vec<String>, Vec<String>)> {
    with_db(state, |conn| {
        let mut stmt = conn.prepare(
            r#"
            SELECT e.id, e.title
            FROM relationships r
            JOIN entities e ON e.id = r.from_entity_id
            WHERE r.to_entity_id = ?1
              AND r.relationship_type = 'contains'
              AND e.entity_type = 'project'
              AND e.archived = 0
            ORDER BY e.title COLLATE NOCASE
            "#,
        )?;
        let rows = stmt.query_map(params![doc_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut ids = Vec::new();
        let mut titles = Vec::new();
        for row in rows {
            let (id, title) = row?;
            ids.push(id);
            titles.push(title);
        }
        Ok((ids, titles))
    })
}
