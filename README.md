# External Brain Drive

Local-first personal operating system for knowledge work.

> Software that remembers everything so you don't have to.

## v0.1 — core complete

| Feature | Status |
|---------|--------|
| Local workspace create / open | ✅ |
| Entity engine (note, task, project, person, inbox) | ✅ |
| Capture + detail edit / archive | ✅ |
| Project relationships | ✅ |
| Full-text search (SQLite FTS5) | ✅ |
| Daily Focus (open tasks + recent) | ✅ |
| Workspace backups + restore | ✅ |
| Offline-first desktop app | ✅ |

**Not in v0.1** (later phases): AI, OCR, plugins, sync, multi-user.

## Docs

| Doc | Purpose |
|-----|---------|
| [docs/STATUS.md](./docs/STATUS.md) | What we built, current state, what’s left |
| [docs/HOW_TO_USE.md](./docs/HOW_TO_USE.md) | How to use the app as it stands |

## Stack

| Layer | Tech |
|-------|------|
| Desktop shell | Tauri 2 |
| Backend | Rust + SQLite (WAL, FTS5, online backup) |
| Frontend | React + TypeScript + Vite |

## Workspace layout

```
MyBrain/
  workspace.db
  workspace.json
  Documents/
  Attachments/
  Backups/          # auto snapshots (last 10)
  Cache/
  Settings/
  Plugins/
```

## Develop

Prerequisites: Node 20+, Rust stable, [Tauri 2 platform deps](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev
```

Build:

```bash
npm run tauri build
```

## How to use (v0.1)

1. **Create** or **open** a workspace folder  
2. Land on **Daily Focus** — open tasks + recently touched  
3. **Capture** with type + title, press **Enter**  
4. Click any item → edit, archive, link to a project, mark tasks done  
5. **Search** by keyword  
6. **Backups** auto-run on open; restore anytime  

Keyboard:

- `Enter` — capture (title field)  
- `Ctrl/Cmd+S` — save detail  
- `Esc` — close detail panel  

## Architecture

```
UI (React)
  → Tauri commands
    → Entity Engine + Backup service
      → SQLite workspace
      → Filesystem folders
```

All product objects go through the entity engine — not ad-hoc tables per feature.

## Roadmap

1. **Core** (this release) — workspace, entities, focus, search, backups  
2. **AI** — provider abstraction, assistive summaries  
3. **Plugins / collab** — extensible entity types, optional encrypted sync  

Product specs: `_PROJECTS/TBD`.

## License

Private / TBD.
