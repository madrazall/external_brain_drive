use crate::error::{AppError, AppResult};
use crate::workspace::with_db;
use crate::state::AppState;
use chrono::{SecondsFormat, Utc};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const ALLOWED_TYPES: &[&str] = &["note", "task", "project", "person", "inbox"];
const ALLOWED_REL_TYPES: &[&str] = &[
    "owns",
    "contains",
    "references",
    "mentions",
    "assigned_to",
    "blocked_by",
    "depends_on",
    "related_to",
    "parent_of",
    "child_of",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    pub id: String,
    pub entity_type: String,
    pub title: String,
    pub description: String,
    pub metadata: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
    pub version: i64,
    pub archived: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEntityInput {
    pub entity_type: String,
    pub title: String,
    pub description: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub project_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEntityInput {
    pub id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub archived: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Relationship {
    pub id: String,
    pub from_entity_id: String,
    pub to_entity_id: String,
    pub relationship_type: String,
    pub created_at: String,
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn validate_entity_type(entity_type: &str) -> AppResult<()> {
    if ALLOWED_TYPES.contains(&entity_type) {
        Ok(())
    } else {
        Err(AppError::msg(format!(
            "Unsupported entity type '{entity_type}'. Allowed: {}",
            ALLOWED_TYPES.join(", ")
        )))
    }
}

fn validate_rel_type(rel_type: &str) -> AppResult<()> {
    if ALLOWED_REL_TYPES.contains(&rel_type) {
        Ok(())
    } else {
        Err(AppError::msg(format!(
            "Unsupported relationship type '{rel_type}'."
        )))
    }
}

fn map_entity(row: &rusqlite::Row<'_>) -> rusqlite::Result<Entity> {
    let metadata_raw: String = row.get(4)?;
    let metadata = serde_json::from_str(&metadata_raw).unwrap_or(serde_json::json!({}));
    let archived: i64 = row.get(8)?;
    Ok(Entity {
        id: row.get(0)?,
        entity_type: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        metadata,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        version: row.get(7)?,
        archived: archived != 0,
    })
}

pub fn create_entity(state: &AppState, input: CreateEntityInput) -> AppResult<Entity> {
    let entity_type = input.entity_type.trim().to_lowercase();
    validate_entity_type(&entity_type)?;

    let title = input.title.trim();
    if title.is_empty() {
        return Err(AppError::msg("Title cannot be empty."));
    }

    let description = input.description.unwrap_or_default();
    let metadata = input.metadata.unwrap_or(serde_json::json!({}));
    let id = Uuid::new_v4().to_string();
    let ts = now();
    let metadata_raw = serde_json::to_string(&metadata)?;

    with_db(state, |conn| {
        conn.execute(
            r#"
            INSERT INTO entities (
                id, entity_type, title, description, metadata,
                created_at, updated_at, version, archived
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, 0)
            "#,
            params![
                id,
                entity_type,
                title,
                description,
                metadata_raw,
                ts,
                ts
            ],
        )?;

        conn.execute(
            r#"
            INSERT INTO timeline_events (id, entity_id, event_type, summary, payload, created_at)
            VALUES (?1, ?2, 'entity.created', ?3, ?4, ?5)
            "#,
            params![
                Uuid::new_v4().to_string(),
                id,
                format!("Created {entity_type}: {title}"),
                serde_json::json!({ "entityType": entity_type }).to_string(),
                ts
            ],
        )?;

        if let Some(project_id) = input.project_id.as_deref() {
            let project_exists: Option<String> = conn
                .query_row(
                    "SELECT id FROM entities WHERE id = ?1 AND entity_type = 'project' AND archived = 0",
                    params![project_id],
                    |row| row.get(0),
                )
                .optional()?;

            if project_exists.is_none() {
                return Err(AppError::msg("Linked project does not exist."));
            }

            conn.execute(
                r#"
                INSERT INTO relationships (
                    id, from_entity_id, to_entity_id, relationship_type, created_at
                ) VALUES (?1, ?2, ?3, 'contains', ?4)
                "#,
                params![Uuid::new_v4().to_string(), project_id, id, ts],
            )?;
        }

        get_entity_by_id(conn, &id)
    })
}

pub fn update_entity(state: &AppState, input: UpdateEntityInput) -> AppResult<Entity> {
    with_db(state, |conn| {
        let existing = get_entity_by_id(conn, &input.id)?;
        let title = input
            .title
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .unwrap_or(existing.title);
        let description = input.description.unwrap_or(existing.description);
        let metadata = input.metadata.unwrap_or(existing.metadata);
        let archived = input.archived.unwrap_or(existing.archived);
        let ts = now();
        let metadata_raw = serde_json::to_string(&metadata)?;

        conn.execute(
            r#"
            UPDATE entities
            SET title = ?1,
                description = ?2,
                metadata = ?3,
                updated_at = ?4,
                version = version + 1,
                archived = ?5
            WHERE id = ?6
            "#,
            params![
                title,
                description,
                metadata_raw,
                ts,
                if archived { 1 } else { 0 },
                input.id
            ],
        )?;

        get_entity_by_id(conn, &input.id)
    })
}

pub fn get_entity(state: &AppState, id: &str) -> AppResult<Entity> {
    with_db(state, |conn| get_entity_by_id(conn, id))
}

fn get_entity_by_id(conn: &rusqlite::Connection, id: &str) -> AppResult<Entity> {
    conn.query_row(
        r#"
        SELECT id, entity_type, title, description, metadata,
               created_at, updated_at, version, archived
        FROM entities
        WHERE id = ?1
        "#,
        params![id],
        map_entity,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::msg("Entity not found."),
        other => AppError::from(other),
    })
}

pub fn list_entities(
    state: &AppState,
    entity_type: Option<String>,
    include_archived: bool,
    limit: Option<i64>,
) -> AppResult<Vec<Entity>> {
    with_db(state, |conn| {
        let limit = limit.unwrap_or(100).clamp(1, 500);
        let mut sql = String::from(
            r#"
            SELECT id, entity_type, title, description, metadata,
                   created_at, updated_at, version, archived
            FROM entities
            WHERE 1 = 1
            "#,
        );

        if !include_archived {
            sql.push_str(" AND archived = 0");
        }
        if entity_type.is_some() {
            sql.push_str(" AND entity_type = ?1");
        }
        sql.push_str(" ORDER BY updated_at DESC LIMIT ");
        sql.push_str(&limit.to_string());

        let mut stmt = conn.prepare(&sql)?;
        let rows = if let Some(ref t) = entity_type {
            stmt.query_map(params![t], map_entity)?
        } else {
            stmt.query_map([], map_entity)?
        };

        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    })
}

pub fn search_entities(state: &AppState, query: &str, limit: Option<i64>) -> AppResult<Vec<Entity>> {
    let q = query.trim();
    if q.is_empty() {
        return list_entities(state, None, false, limit);
    }

    // FTS5: quote tokens safely by using a simple prefix/match style query.
    let fts_query = q
        .split_whitespace()
        .map(|token| {
            let cleaned: String = token
                .chars()
                .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
                .collect();
            if cleaned.is_empty() {
                String::new()
            } else {
                format!("{cleaned}*")
            }
        })
        .filter(|t| !t.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    if fts_query.is_empty() {
        return Ok(vec![]);
    }

    let limit = limit.unwrap_or(50).clamp(1, 200);

    with_db(state, |conn| {
        let mut stmt = conn.prepare(
            r#"
            SELECT e.id, e.entity_type, e.title, e.description, e.metadata,
                   e.created_at, e.updated_at, e.version, e.archived
            FROM entities_fts f
            JOIN entities e ON e.rowid = f.rowid
            WHERE entities_fts MATCH ?1
              AND e.archived = 0
            ORDER BY bm25(entities_fts)
            LIMIT ?2
            "#,
        )?;

        let rows = stmt.query_map(params![fts_query, limit], map_entity)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    })
}

pub fn link_entities(
    state: &AppState,
    from_entity_id: &str,
    to_entity_id: &str,
    relationship_type: &str,
) -> AppResult<Relationship> {
    validate_rel_type(relationship_type)?;
    let id = Uuid::new_v4().to_string();
    let ts = now();

    with_db(state, |conn| {
        // Ensure both entities exist
        let _: String = conn.query_row(
            "SELECT id FROM entities WHERE id = ?1",
            params![from_entity_id],
            |row| row.get(0),
        )?;
        let _: String = conn.query_row(
            "SELECT id FROM entities WHERE id = ?1",
            params![to_entity_id],
            |row| row.get(0),
        )?;

        conn.execute(
            r#"
            INSERT INTO relationships (
                id, from_entity_id, to_entity_id, relationship_type, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(from_entity_id, to_entity_id, relationship_type) DO NOTHING
            "#,
            params![id, from_entity_id, to_entity_id, relationship_type, ts],
        )?;

        let rel_id: String = conn.query_row(
            r#"
            SELECT id FROM relationships
            WHERE from_entity_id = ?1 AND to_entity_id = ?2 AND relationship_type = ?3
            "#,
            params![from_entity_id, to_entity_id, relationship_type],
            |row| row.get(0),
        )?;

        Ok(Relationship {
            id: rel_id,
            from_entity_id: from_entity_id.to_string(),
            to_entity_id: to_entity_id.to_string(),
            relationship_type: relationship_type.to_string(),
            created_at: ts,
        })
    })
}

pub fn list_project_entities(state: &AppState, project_id: &str) -> AppResult<Vec<Entity>> {
    with_db(state, |conn| {
        let mut stmt = conn.prepare(
            r#"
            SELECT e.id, e.entity_type, e.title, e.description, e.metadata,
                   e.created_at, e.updated_at, e.version, e.archived
            FROM relationships r
            JOIN entities e ON e.id = r.to_entity_id
            WHERE r.from_entity_id = ?1
              AND r.relationship_type = 'contains'
              AND e.archived = 0
            ORDER BY e.updated_at DESC
            "#,
        )?;
        let rows = stmt.query_map(params![project_id], map_entity)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    })
}
