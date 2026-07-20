use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use std::path::Path;

pub fn open_database(db_path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(db_path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE TABLE IF NOT EXISTS entities (
            id TEXT PRIMARY KEY NOT NULL,
            entity_type TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            metadata TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            archived INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_entities_type
            ON entities(entity_type) WHERE archived = 0;
        CREATE INDEX IF NOT EXISTS idx_entities_updated
            ON entities(updated_at DESC) WHERE archived = 0;

        CREATE TABLE IF NOT EXISTS relationships (
            id TEXT PRIMARY KEY NOT NULL,
            from_entity_id TEXT NOT NULL,
            to_entity_id TEXT NOT NULL,
            relationship_type TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
            FOREIGN KEY (to_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
            UNIQUE(from_entity_id, to_entity_id, relationship_type)
        );

        CREATE INDEX IF NOT EXISTS idx_relationships_from
            ON relationships(from_entity_id);
        CREATE INDEX IF NOT EXISTS idx_relationships_to
            ON relationships(to_entity_id);

        CREATE TABLE IF NOT EXISTS timeline_events (
            id TEXT PRIMARY KEY NOT NULL,
            entity_id TEXT,
            event_type TEXT NOT NULL,
            summary TEXT NOT NULL,
            payload TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_timeline_created
            ON timeline_events(created_at DESC);

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
            title,
            description,
            content='entities',
            content_rowid='rowid'
        );

        CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
            INSERT INTO entities_fts(rowid, title, description)
            VALUES (new.rowid, new.title, new.description);
        END;

        CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
            INSERT INTO entities_fts(entities_fts, rowid, title, description)
            VALUES ('delete', old.rowid, old.title, old.description);
        END;

        CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
            INSERT INTO entities_fts(entities_fts, rowid, title, description)
            VALUES ('delete', old.rowid, old.title, old.description);
            INSERT INTO entities_fts(rowid, title, description)
            VALUES (new.rowid, new.title, new.description);
        END;
        "#,
    )?;

    let applied: i64 = conn.query_row(
        "SELECT COUNT(*) FROM schema_migrations WHERE version = 1",
        [],
        |row| row.get(0),
    )?;

    if applied == 0 {
        conn.execute(
            "INSERT INTO schema_migrations (version) VALUES (?1)",
            params![1],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
            params!["workspace_schema_version", "1"],
        )?;
    }

    Ok(())
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query(params![key])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn validate_connection(conn: &Connection) -> AppResult<()> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'entities'",
        [],
        |row| row.get(0),
    )?;
    if count == 0 {
        return Err(AppError::msg(
            "Selected folder is not a valid External Brain Drive workspace (missing entities table).",
        ));
    }
    Ok(())
}
