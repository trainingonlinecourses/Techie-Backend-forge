---
title: Git Basics — The Snapshot Machine
module: git-github-basics
order: 1
minutes: 25
topics: ["git", "commits", "staging", "repositories", "history", "version control"]
summary: The core mental model — Git stores snapshots, not changes:
docs:
  - title: "Git documentation"
    url: "https://git-scm.com/doc"
---

# Git Basics — The Snapshot Machine

## The Concept: A Time Machine for Your Code

**Git** is a **version control system**: it records snapshots of your project over time, so you can look back, compare, revert, and branch. Every developer on a team works against the same history; every change is attributable and reversible.

The core mental model — **Git stores snapshots, not changes**:

- A **commit** is a snapshot of the whole project at a moment: "the code as of this point."
- Each commit points to its parent (the previous snapshot), forming a **history** — a chain of snapshots.
- Branches are *labels* that move along the chain as new commits land.

Think of a photo album of your project: every time you finish a piece of work, you take a picture (commit). You can always flip back to any picture, and the album tells the story of how the code evolved.

## The Three Areas (The Daily Mental Model)

```
Working directory  -->  Staging area  -->  Repository (commits)
   (your files)         (what's next)      (the history)
```

1. **Working directory** — the files you're editing.
2. **Staging area** — the *selected* changes you're preparing (the "next commit" box).
3. **Repository** — the committed history.

The staging step is what makes Git powerful: you can commit *part* of your work (this file, not that one) in a logical unit.

## The Code Walkthrough — The Daily Commands

```bash
# ---- 1. Start tracking a project ----
git init                       # create a repository in the current folder
git status                     # "what's going on?" — the most-used command

# ---- 2. The commit flow ----
git add src/App.java           # stage one file
git add -A                     # stage everything (careful — see below)
git status                     # review what's staged vs unstaged
git commit -m "Add user login flow"
#   A snapshot is saved: the staged changes become a permanent commit

# ---- 3. Look at the history ----
git log --oneline              # compact history: each commit, one line
git log --oneline --graph      # with the branch structure
git show <commit-hash>         # what a specific commit changed

# ---- 4. The "oops" commands ----
git diff                       # unstaged changes (working vs staged)
git diff --staged              # staged changes (staged vs last commit)
git restore src/App.java       # discard uncommitted changes to a file
git restore --staged App.java  # unstage (keep the changes)
git reset --hard HEAD          # DANGER: discard ALL uncommitted changes
```

### Walking Through Each Part

**`git status`** — the orientation command: which files changed, which are staged, which are untracked. Run it constantly; it tells you exactly where you are.

**`git add`** — moves changes into the staging area. Staging *selects* what the next commit contains. `git add -A` stages everything — convenient, but it can sweep unrelated changes (a config file, a stray log) into your commit; prefer staging deliberately (`git add <file>` or `git add <pattern>`).

**`git commit -m "..."`** — creates the snapshot. The message is the *why*, not the what: "Add user login flow" beats "Update stuff". Each commit should be a coherent unit: one idea, one change, one message.

**`git log`** — the history viewer. `--oneline` compresses each commit to a hash + message; `--graph` shows the branching topology. You'll read more history than you write.

**`git restore`** — the undo: discards *uncommitted* changes to a file (restores it to the last commit). **`git reset --hard`** discards *all* uncommitted work — it's the "nuclear" undo, used rarely and carefully.

## Committing Well — The Discipline

| Good commit | Bad commit |
|---|---|
| One logical change | 40 files, 6 unrelated changes |
| Message explains *why* | "update" / "fix" / "stuff" |
| Builds & tests pass | Breaks the build |
| Staged deliberately | `git add -A` accidents, secrets included |

The practical rhythm: **small commits, often, with honest messages.** A commit is a checkpoint you can return to — the more checkpoints, the finer your time machine's resolution.

## The .gitignore — What Never Gets Committed

```gitignore
# build outputs
target/
node_modules/
dist/

# local config & secrets
.env
.env.local
*.pem

# editor/OS noise
.idea/
.vscode/
.DS_Store
```

`gitignore` tells Git *never* to track these: build artifacts (regenerable), secrets (never in history), and editor noise. **The rule:** if it's generated or secret, ignore it. (This academy's repo ignores `.env.local` — the local keys — precisely so they never enter history.)

## Common Beginner Pitfalls

1. **Committing secrets** — `git add -A` with a `.env` file → the secret is in history *forever* (even after deletion). Ignore secrets, audit your commits.
2. **`git add -A` for everything** — unrelated changes ride into one commit; stage deliberately.
3. **Vague commit messages** — history becomes useless; write the why.
4. **Panic `git reset --hard`** — wipes uncommitted work you may have wanted; `git stash` is the gentle alternative.
5. **Not committing for hours** — one giant commit with no checkpoints; commit small units as you finish them.
6. **Ignoring `.gitignore`** — `target/`, `node_modules/`, and logs bloat the repo and pollute every clone.
7. **Confusing the three areas** — a file can be changed (working), staged, or committed; `git status` shows exactly which.

## Key Takeaways

- Git stores snapshots (commits) in a history — a time machine with branches.
- Three areas: working directory → staging → repository.
- The rhythm: `status` → `add` (deliberately) → `commit` (with a why message) → `log`.
- `git restore` discards uncommitted changes; `git reset --hard` is the nuclear option.
- `.gitignore` keeps generated files and secrets out of history.
- Small, coherent, well-messaged commits make the history readable and the time machine useful.
