# External Brain Drive — How to Use (current build)

A practical guide for the app **as it works today**.  
Companion status notes: [STATUS.md](./STATUS.md).

---

## Install / start

```bash
cd C:\Users\madrazall\_PROJECTS\external_brain_drive
npm install
npm run tauri dev
```

The window is small by default (~400×640) and **stays on top**.  
**PIN** (top right) toggles always-on-top. Drag the edges to resize.

---

## First time

1. **Create** a workspace  
   - Name it (e.g. `My Brain`)  
   - Choose a parent folder  
   - App creates a folder with `workspace.db`, `Documents/`, `Backups/`, etc.

2. Or **Open** an existing workspace folder (must contain `workspace.db`).

Recent workspaces appear on the welcome screen.

**⋯** (top right) → switch workspace later.

---

## The main idea

| Step | What you do |
|------|-------------|
| 1 | Dump anything into the top bar and press **Enter** |
| 2 | It sits in the **Thoughts** pool (unsorted) |
| 3 | Later: one-tap **Note / Task / Event / Project / Person**, or open and edit |
| 4 | Link things to **projects**, people, and **documents** as needed |

Capture is deliberately dumb and fast. Organization is optional and later.

---

## Top bar (always)

```
[ ENTER THOUGHT...                    ] [ADD]
```

- Type a line → **Enter** or **Add**  
- Field clears immediately so you can dump several in a row  
- In the app, press **`/`** to focus the capture field (when not typing in another field)

Everything from this bar becomes a **Thought** (unsorted).

---

## Navigation

| Tab | Meaning |
|-----|---------|
| **Home** | Thought pool, open tasks, recent items |
| **Proj** | Projects and what’s linked to them |
| **People** | Contacts (phone, email, etc.) |
| **Docs** | Files in the workspace Documents folder |
| **Find** | Full-text search |
| **Arch** | Archived (hidden) items — restore here |
| **Bak** | Database backups |

Also: **PIN** (always on top), **⋯** (switch workspace).

---

## Home

### Pool
- Unsorted thoughts  
- **Note / Task / Event / Project / Person** — convert with one click  
- **Event** opens so you can set **date** (and optional time/location) and link a **project**  

### Upcoming
- Next events by date (not mixed into Focus tasks)  
- Needs a date in Edit to appear here  
- Project badge shows if linked  


- **Dismiss** — archives without sorting  
- Click the title — open overview panel  

### Focus (open tasks)
- Home only shows a small **focus** set (about 5 tasks), not your entire backlog  
- **Automatic ranking** (no daily triage required):
  - ★ **Pinned** always on top (star on the row or in task overview)
  - Recently **touched** (opened / edited / status) stays hot  
  - Linked to a **project** ranks above free-floating tasks  
  - Brand-new tasks surface briefly, then fall if you ignore them  
- Everything else sits under **“N more open tasks”** (dimmed when expanded)  
- Checkbox marks done/open  
- **Pin sparingly** — the point is a working set, not ranking everything  


### Recent
- Non-thought items you touched lately  

**Badges** under items show linked projects, people, docs, etc. without opening.

---

## Projects

1. Create a project by sorting a thought as **Project**, or capture/sort something as Project.  
2. Select a project on the left (or list).  
3. You’ll see:
   - **People** on the project (Call / Email)  
   - **Documents** (Open / Folder)  
   - **Items** (notes, tasks, etc.)  

**Link** existing people or docs, or **Import** a file onto that project.

Open a project (or any item) for a full **overview** panel.

---

## Detail panel (right / bottom)

### Overview (default)
- Read-only title, description, linked content  
- Projects show people, docs, tasks, notes, counts  
- Useful actions stay available (mark task done, open file, call/email)  

### Edit
1. Click **Edit** (or `Ctrl/Cmd+E`)  
2. Change type, title, description, links, archive  
3. **Save** or **Cancel**  
4. `Esc` — leave edit (or close panel if not editing)  
5. `Ctrl/Cmd+S` — save while editing  

### Change type
If you made a Task that should be a Project: **Edit → Type → Project**.

### Archive
**Edit → Archive** (or archive from edit actions).  
Item disappears from normal lists → find it under **Arch**.

---

## People

**People** tab:
1. Add name, phone, email, company, role, notes  
2. Optionally attach to a project on create  
3. Directory with filter  
4. **Call** / **Email** / open detail  

On a project, people show with the same quick Call/Email actions.

---

## Documents

Files live on disk under:

```
YourWorkspace/Documents/
```

### Import
1. **Docs → Import file** (or import from a project)  
2. File is **copied** into `Documents/`  
3. App stores a document entity + relative path  
4. Optionally linked to a project at import time  

### Use
- **Open** — system default app  
- **Folder** — reveal in Explorer  
- **+ Project** — attach to a project  
- **Open folder** — open the whole Documents directory  

Missing file (moved/deleted outside the app) shows as **missing**; re-import if needed.

---

## Search

**Find** tab:
- Type keywords → Enter  
- Searches titles and descriptions (FTS5)  
- Click a result to open overview  

---

## Archive

**Arch** tab:
- Everything soft-deleted  
- **Restore** on the row, or open → **Restore**  
- Restored items reappear in normal lists  

Archive is **not** permanent delete. Data stays in `workspace.db`.

---

## Backups

**Bak** tab:
- Snapshots of `workspace.db` in `YourWorkspace/Backups/`  
- Created **automatically when you open** a workspace  
- **Backup now** anytime  
- Keeps the **last 10**  
- **Restore** replaces the live DB after making a **safety** backup of current data  

Use backups before big experiments or if something feels wrong.

---

## Keyboard cheat sheet

| Key | Action |
|-----|--------|
| **Enter** | Capture (in thought field) |
| **/** | Focus capture (when not in an input) |
| **Ctrl/Cmd+E** | Enter edit mode (detail open) |
| **Ctrl/Cmd+S** | Save (while editing) |
| **Esc** | Cancel edit, or close detail |

---

## Typical daily loop

1. Park the window on a corner (**PIN** on).  
2. Dump thoughts as they hit you (Enter, Enter, Enter).  
3. Later, open **Home** → sort the pool.  
4. Work a **project** overview for people + docs + tasks.  
5. Archive noise; restore from **Arch** if you were wrong.  
6. Trust **Bak** if you need a rollback.

---

## Tips

- **Capture first** — don’t pick a type in the heat of the moment.  
- **Badges** tell you if something is already tied to a project.  
- **Documents** should go through Import so paths stay inside the workspace.  
- One workspace open at a time; use **⋯** to switch.  
- If UI looks old after a Rust change, fully restart `npm run tauri dev`.

---

## What this guide is not

This is not the full “platform” vision in `_PROJECTS/TBD` (AI, plugins, sync, etc.).  
Those are planned later. This guide matches the **shipping vertical slice** only.

See [STATUS.md](./STATUS.md) for “done / not done / next.”
