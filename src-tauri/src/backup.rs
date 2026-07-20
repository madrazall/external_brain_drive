use crate::db::open_database;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use chrono::Utc;
use rusqlite::backup::Backup;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

const WORKSPACE_DB: &str = "workspace.db";
const BACKUPS_DIR: &str = "Backups";
const MAX_BACKUPS: usize = 10;
const BACKUP_PREFIX: &str = "workspace-";
const BACKUP_SUFFIX: &str = ".db";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub file_name: String,
    pub path: String,
    pub size_bytes: u64,
    pub created_at: String,
}

pub fn create_backup(state: &AppState) -> AppResult<BackupInfo> {
    let workspace_path = current_workspace_path(state)?;
    let backups_dir = ensure_backups_dir(&workspace_path)?;

    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let file_name = format!("{BACKUP_PREFIX}{stamp}{BACKUP_SUFFIX}");
    let dest = backups_dir.join(&file_name);

    // Avoid clobbering if two backups land in the same second.
    let dest = unique_path(dest);

    {
        let guard = state
            .db
            .lock()
            .map_err(|_| AppError::msg("Failed to lock database state."))?;
        let conn = guard
            .as_ref()
            .ok_or_else(|| AppError::msg("No workspace is open."))?;

        // Push WAL into the main DB so the snapshot is consistent.
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        snapshot_connection(conn, &dest)?;
    }

    prune_old_backups(&backups_dir)?;
    backup_info_for(&dest)
}

/// Create a backup without requiring AppState lock on path — used right after open.
pub fn create_backup_from_conn(
    workspace_path: &Path,
    conn: &Connection,
) -> AppResult<BackupInfo> {
    let backups_dir = ensure_backups_dir(workspace_path)?;
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let file_name = format!("{BACKUP_PREFIX}{stamp}{BACKUP_SUFFIX}");
    let dest = unique_path(backups_dir.join(file_name));

    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    snapshot_connection(conn, &dest)?;
    prune_old_backups(&backups_dir)?;
    backup_info_for(&dest)
}

pub fn list_backups(state: &AppState) -> AppResult<Vec<BackupInfo>> {
    let workspace_path = current_workspace_path(state)?;
    let backups_dir = workspace_path.join(BACKUPS_DIR);
    if !backups_dir.is_dir() {
        return Ok(vec![]);
    }

    let mut items = Vec::new();
    for entry in fs::read_dir(&backups_dir)? {
        let entry = entry?;
        let path = entry.path();
        if !is_backup_file(&path) {
            continue;
        }
        if let Ok(info) = backup_info_for(&path) {
            items.push(info);
        }
    }

    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(items)
}

pub fn restore_backup(state: &AppState, backup_path: &str) -> AppResult<BackupInfo> {
    let workspace_path = current_workspace_path(state)?;
    let source = PathBuf::from(backup_path);

    if !source.is_file() || !is_backup_file(&source) {
        return Err(AppError::msg("Invalid backup file."));
    }

    // Safety: only restore from this workspace's Backups folder.
    let backups_dir = workspace_path
        .join(BACKUPS_DIR)
        .canonicalize()
        .map_err(|_| AppError::msg("Could not resolve Backups folder."))?;
    let source_canon = source
        .canonicalize()
        .map_err(|_| AppError::msg("Backup file not found."))?;
    if !source_canon.starts_with(&backups_dir) {
        return Err(AppError::msg(
            "Backup must be inside this workspace's Backups folder.",
        ));
    }

    // Snapshot current DB first so restore is reversible.
    let safety = {
        let guard = state
            .db
            .lock()
            .map_err(|_| AppError::msg("Failed to lock database state."))?;
        let conn = guard
            .as_ref()
            .ok_or_else(|| AppError::msg("No workspace is open."))?;
        create_backup_from_conn(&workspace_path, conn)?
    };

    // Close live connection so Windows can replace the file.
    {
        let mut guard = state
            .db
            .lock()
            .map_err(|_| AppError::msg("Failed to lock database state."))?;
        *guard = None;
    }

    let db_path = workspace_path.join(WORKSPACE_DB);
    let wal_path = workspace_path.join(format!("{WORKSPACE_DB}-wal"));
    let shm_path = workspace_path.join(format!("{WORKSPACE_DB}-shm"));

    let restore_result = (|| -> AppResult<()> {
        if db_path.exists() {
            fs::remove_file(&db_path)?;
        }
        let _ = fs::remove_file(&wal_path);
        let _ = fs::remove_file(&shm_path);
        fs::copy(&source_canon, &db_path)?;
        Ok(())
    })();

    // Always reopen, even if restore failed mid-way (best effort).
    let reopen = open_database(&db_path);
    match (restore_result, reopen) {
        (Ok(()), Ok(conn)) => {
            {
                let mut guard = state
                    .db
                    .lock()
                    .map_err(|_| AppError::msg("Failed to lock database state."))?;
                *guard = Some(conn);
            }
            Ok(safety)
        }
        (Err(e), Ok(conn)) => {
            {
                let mut guard = state
                    .db
                    .lock()
                    .map_err(|_| AppError::msg("Failed to lock database state."))?;
                *guard = Some(conn);
            }
            Err(e)
        }
        (Ok(()), Err(e)) => Err(AppError::msg(format!(
            "Backup was copied but workspace could not be reopened: {e}"
        ))),
        (Err(e), Err(reopen_err)) => Err(AppError::msg(format!(
            "Restore failed ({e}); reopen also failed ({reopen_err}). \
             A safety backup was saved as {}.",
            safety.file_name
        ))),
    }
}

fn snapshot_connection(conn: &Connection, dest: &Path) -> AppResult<()> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    if dest.exists() {
        fs::remove_file(dest)?;
    }

    let mut dst = Connection::open(dest)?;
    {
        let backup = Backup::new(conn, &mut dst)
            .map_err(|e| AppError::msg(format!("SQLite backup init failed: {e}")))?;
        backup
            .run_to_completion(100, Duration::from_millis(10), None)
            .map_err(|e| AppError::msg(format!("SQLite backup failed: {e}")))?;
    }
    // Ensure destination is fully written.
    dst.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    Ok(())
}

fn ensure_backups_dir(workspace_path: &Path) -> AppResult<PathBuf> {
    let dir = workspace_path.join(BACKUPS_DIR);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn prune_old_backups(backups_dir: &Path) -> AppResult<()> {
    let mut files: Vec<_> = fs::read_dir(backups_dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| is_backup_file(p))
        .collect();

    files.sort_by_key(|p| {
        fs::metadata(p)
            .and_then(|m| m.modified())
            .ok()
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default())
            .unwrap_or_default()
    });
    // oldest first — remove until only MAX_BACKUPS remain
    while files.len() > MAX_BACKUPS {
        if let Some(old) = files.first().cloned() {
            let _ = fs::remove_file(&old);
            files.remove(0);
        } else {
            break;
        }
    }
    Ok(())
}

fn is_backup_file(path: &Path) -> bool {
    path.is_file()
        && path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.starts_with(BACKUP_PREFIX) && n.ends_with(BACKUP_SUFFIX))
            .unwrap_or(false)
}

fn backup_info_for(path: &Path) -> AppResult<BackupInfo> {
    let meta = fs::metadata(path)?;
    let created = meta
        .modified()
        .or_else(|_| meta.created())
        .ok()
        .and_then(|t| {
            let dt: chrono::DateTime<Utc> = t.into();
            Some(dt.to_rfc3339())
        })
        .unwrap_or_else(|| Utc::now().to_rfc3339());

    Ok(BackupInfo {
        file_name: path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default(),
        path: path.to_string_lossy().to_string(),
        size_bytes: meta.len(),
        created_at: created,
    })
}

fn unique_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "workspace".into());
    let parent = path.parent().map(Path::to_path_buf).unwrap_or_default();
    for i in 1..100 {
        let candidate = parent.join(format!("{stem}-{i}{BACKUP_SUFFIX}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!(
        "{stem}-{}{BACKUP_SUFFIX}",
        Utc::now().timestamp_millis()
    ))
}

fn current_workspace_path(state: &AppState) -> AppResult<PathBuf> {
    let guard = state
        .workspace_path
        .lock()
        .map_err(|_| AppError::msg("Failed to lock workspace path."))?;
    guard
        .clone()
        .ok_or_else(|| AppError::msg("No workspace is open."))
}
