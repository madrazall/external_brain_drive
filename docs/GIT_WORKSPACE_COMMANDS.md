# Git handoff — setup + daily (testing mode)

Use this while testing multi-device / multi-location.  
**Rule:** never run Brain Drive and `git pull`/`push` on the same workspace at the same time.  
**Always fully quit the app** before pull/commit/push.

Replace paths if yours differ.

| Thing | Example |
|--------|---------|
| App repo | `C:\Users\madrazall\_PROJECTS\external_brain_drive` |
| Workspace (data) | put this **outside** the app repo, e.g. `C:\Users\madrazall\BrainWorkspaces\MyBrain` |
| Remote | private GitHub repo for **data only** (not required to be the app repo) |

> Tip: keep **app code** and **brain data** as separate folders (and usually separate repos).

---

## One-time setup (Device A — first machine)

### 1. Create workspace in the app
- Open Brain Drive  
- Create workspace in a folder you choose (remember the path)  
- Quit the app completely  

### 2. Init git in the **workspace** folder

```powershell
cd "C:\Users\madrazall\BrainWorkspaces\MyBrain"

git init
git branch -M main
```

### 3. Ignore noise (keep the DB + Documents)

```powershell
@"
# SQLite temp (should be gone if app is closed; ignore just in case)
*.db-wal
*.db-shm
*.db-journal

# Optional: skip local junk
Cache/
"@ | Set-Content -Encoding utf8 .gitignore
```

Optional: also ignore `Backups/` if the repo gets large:

```powershell
Add-Content .gitignore "Backups/"
```

### 4. First commit

```powershell
cd "C:\Users\madrazall\BrainWorkspaces\MyBrain"

git add -A
git status
git commit -m "brain: initial workspace"
```

### 5. Private remote (GitHub example)

Create an **empty private** repo on GitHub (no README), then:

```powershell
cd "C:\Users\madrazall\BrainWorkspaces\MyBrain"

git remote add origin https://github.com/YOUR_USER/YOUR_BRAIN_REPO.git
git push -u origin main
```

---

## One-time setup (Device B — second machine / new location)

```powershell
# pick a parent folder
cd "C:\Users\madrazall\BrainWorkspaces"

git clone https://github.com/YOUR_USER/YOUR_BRAIN_REPO.git MyBrain
```

Then in Brain Drive: **Open workspace** → select `...\MyBrain` (the folder with `workspace.db`).

---

## Daily — arrive at work (or new location)

**Goal:** get latest brain, then open the app.

```powershell
# 1) App must be CLOSED

cd "C:\Users\madrazall\BrainWorkspaces\MyBrain"

git status
git pull

# 2) If pull complains about local changes you don't care about (testing only):
# git checkout -- .
# git clean -fd
# git pull

# 3) Open Brain Drive and open this workspace folder
```

If you’re on the machine that already has the folder and only need updates: **pull is enough** (no re-clone).

---

## Daily — leave work (or switch location)

**Goal:** save brain, then leave.

```powershell
# 1) Fully QUIT Brain Drive (not just minimize)

cd "C:\Users\madrazall\BrainWorkspaces\MyBrain"

# 2) Confirm SQLite temp files are gone (optional check)
Get-ChildItem *.db*

git add -A
git status
git commit -m "brain: end of day $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git push
```

If nothing changed:

```text
nothing to commit, working tree clean
```

That’s fine — still run `git push` only if you had a commit; otherwise you’re done.

---

## Super-short cards

### Arrive
```powershell
# app CLOSED
cd "C:\Users\madrazall\BrainWorkspaces\MyBrain"
git pull
# then open app → this workspace
```

### Leave
```powershell
# quit app first
cd "C:\Users\madrazall\BrainWorkspaces\MyBrain"
git add -A
git commit -m "brain: sync"
git push
```

---

## If something goes wrong

| Problem | What to try |
|---------|-------------|
| `git pull` conflict on `workspace.db` | Don’t merge by hand. Prefer the side you trust: `git fetch` then `git checkout --theirs workspace.db` **or** `--ours`, then commit. Or restore from `Backups\`. |
| App won’t open / DB error | Restore a file from `Backups\`, or from an older git commit of `workspace.db` |
| Huge repo | Use Git LFS for big PDFs later, or keep bulky files out of git and only sync `workspace.db` (links may break if files aren’t there) |
| Forgot to quit app | Close app, wait a few seconds, `git add -A` again, commit |

Restore `workspace.db` from last good commit (example):

```powershell
cd "C:\Users\madrazall\BrainWorkspaces\MyBrain"
git log --oneline -5
git checkout COMMIT_HASH -- workspace.db
# then open app carefully; commit again if OK
```

---

## Don’t mix

- Don’t put the workspace **inside** the app git repo (`external_brain_drive`) unless you really want code + data coupled.  
- Don’t use **Google Drive + Git** on the **same** folder while testing (pick one).  
- Don’t leave the app open on two machines.

---

## App commands (reminder)

```powershell
cd "C:\Users\madrazall\_PROJECTS\external_brain_drive"
npm run tauri dev
```
