# External Brain Drive — Status Summary

**Date:** 2026-07-21  
**Repo:** `https://github.com/madrazall/external_brain_drive`  
**Local path:** `C:\Users\madrazall\_PROJECTS\external_brain_drive`  
**Specs (product north star):** `C:\Users\madrazall\_PROJECTS\TBD`

---

## What it is

**External Brain Drive** is a local-first desktop app for capturing thoughts, organizing them into notes/tasks/projects, storing people and files, and keeping everything offline on your machine.

> Capture fast → pool → sort later. Everything lives in a workspace folder + SQLite database.

---

## What we built (this phase)

### Product foundation
- Tauri 2 + React + TypeScript + Rust
- Local **workspace** create/open (`workspace.db` + folders)
- **Entity engine** — note, task, project, person, thought (inbox), document
- Relationships (`contains`) for projects → items/people/docs
- Full-text **search** (SQLite FTS5)
- Soft **archive** + restore
- Workspace **backups** (auto on open, last 10, restore with safety copy)

### Capture & home flow
- Always-on **quick note** bar (Enter to save)
- Thoughts land in unsorted **pool**
- One-tap sort: Note / Task / Project / Person
- Dismiss, open for detail
- **Link badges** on lists (project/person/task/doc at a glance)
- Type change from detail panel

### Organization
- **Projects** — people, documents, tasks, notes linked in
- **People** — phone, email, company, role; Call / Email
- **Documents** — files copied into `Documents/`, open with system app, link to projects
- Detail **overview** by default; **Edit** for forms

### App chrome
- Dark minimal UI (Bebas Neue + Urbanist, cyan accent)
- Compact companion window (~400×640, **always on top**, pin toggle)
- Top nav: Home · Proj · People · Docs · Find · Arch · Bak

### Not built (intentionally later)
- AI, OCR, plugins, sync/collaboration, mobile
- Plugin marketplace, knowledge-graph viz
- Full design-system implementation from TBD docs 09–11

---

## What it is now (feature matrix)

| Area | Status | Notes |
|------|--------|--------|
| Workspace create/open | ✅ | Folder = source of truth |
| Quick capture (Enter) | ✅ | Creates `inbox` / thought |
| Thought pool + sort | ✅ | Home screen |
| Notes / tasks / projects / people | ✅ | Entity types |
| Change type later | ✅ | Detail → Edit → Type |
| Project overview | ✅ | People, docs, tasks, counts |
| Edit mode | ✅ | Edit / Save / Cancel |
| People + contact fields | ✅ | Call / Email actions |
| Documents on disk | ✅ | `Workspace/Documents/` |
| Link docs to projects | ✅ | Import or link existing |
| Search (FTS5) | ✅ | Titles + descriptions |
| Link badges on lists | ✅ | Related projects/people/items |
| Archive | ✅ | Soft delete |
| Archived list + restore | ✅ | Arch nav |
| Backups + restore | ✅ | SQLite online backup |
| Always-on-top compact UI | ✅ | Pin toggle |
| AI / OCR / sync / plugins | ❌ | Phase 2+ |
| Markdown notes / rich editor | ❌ | Plain description only |
| Recurring tasks / due dates | ❌ | Task done/open only |
| Drag-drop files into app | ❌ | Import via picker |
| Global hotkey capture | ❌ | `/` focuses field in-app |
| Multi-workspace open | ❌ | One at a time |
| Encrypted cloud sync | ❌ | Local only |

---

## Workspace layout on disk

```
MyWorkspace/
  workspace.db          # entities, relationships, FTS, timeline
  workspace.json        # marker
  Documents/            # imported files
  Attachments/          # reserved
  Backups/              # workspace-YYYYMMDD-HHMMSS.db
  Cache/
  Settings/
  Plugins/              # reserved
```

App also stores recent workspace paths under OS app data  
(`…/external-brain-drive/recent_workspaces.json`).

---

## Architecture (as implemented)

```
UI (React, compact top-nav)
  → Tauri commands
    → Entity engine / documents / backup / workspace
      → SQLite (WAL + FTS5)
      → Filesystem (Documents, Backups)
```

Stack: **Tauri 2 · Rust · SQLite · React · TypeScript · Vite**

---

## What’s left to do

Prioritized for real daily use (not the full TBD platform):

### High value next
1. **Due dates / priority** on tasks (and show on Home)
2. **Drag-drop** files into Docs or onto a project
3. **Global hotkey** for capture (even when unfocused)
4. **Richer notes** (Markdown preview or simple formatting)
5. **Empty / first-run** polish and in-app tips

### Trust & quality
6. Export workspace (zip folder) / import
7. Tests for entity + document + backup paths
8. Handle missing document files more gracefully (re-link)

### Product language & UX
9. Optional light theme
10. Slightly smarter project “complete” view (filter done tasks, pin important people)

### Later (from original roadmap)
11. AI assist (summarize, never auto-control)
12. OCR on documents
13. Encrypted optional sync
14. Plugin SDK / custom entity types
15. Mobile companion

### Spec debt
- Product specs live in `_PROJECTS/TBD` (20+ Word docs); app intentionally implements a **thin vertical slice**, not the full platform.
- Rename product vs “Project TBD” when branding settles.

---

## How to run (dev)

```bash
cd C:\Users\madrazall\_PROJECTS\external_brain_drive
npm install
npm run tauri dev
```

Requires: Node 20+, Rust stable, [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/).

---

## Related docs

| Doc | Purpose |
|-----|---------|
| [HOW_TO_USE.md](./HOW_TO_USE.md) | User guide for the app **as it stands** |
| [README.md](../README.md) | Repo overview / stack |
| `_PROJECTS/TBD/*.docx` | Long-term vision, PRD, architecture specs |
