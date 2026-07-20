# External Brain Drive

Local-first personal operating system for knowledge work.

> Software that remembers everything so you don't have to.

This is the v0.1 vertical slice:

- Create / open a **local workspace** (`workspace.db` + folders)
- Capture **entities** (note, task, project, person, inbox)
- Link items into **projects** via relationships
- **Full-text search** with SQLite FTS5
- Everything offline, on your machine

## Stack

| Layer | Tech |
|-------|------|
| Desktop shell | Tauri 2 |
| Backend | Rust + SQLite (WAL, FTS5) |
| Frontend | React + TypeScript + Vite |

## Workspace layout

```
MyBrain/
  workspace.db
  workspace.json
  Documents/
  Attachments/
  Backups/
  Cache/
  Settings/
  Plugins/
```

## Develop

Prerequisites: Node 20+, Rust stable, platform deps for [Tauri 2](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev
```

Build:

```bash
npm run tauri build
```

## Architecture (v0.1)

```
UI (React)
  → Tauri commands
    → Entity Engine
      → SQLite workspace
      → Filesystem folders
```

All product objects go through the entity engine — not ad-hoc tables per feature.

## Roadmap alignment

Specs live in `_PROJECTS/TBD` (vision, PRD, architecture, etc.).

Build phases:

1. **Core** (this repo) — workspace, entities, search, capture loop  
2. **AI** — provider abstraction, assistive summaries  
3. **Plugins / collab** — extensible entity types, optional encrypted sync  

## License

Private / TBD.
