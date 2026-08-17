---
title: Branching and Merging — Parallel Work, Joined History
module: git-github-basics
order: 2
minutes: 26
topics: ["branches", "merge", "conflicts", "fast-forward", "checkout", "feature branches"]
docs:
  - title: "Git branching (Pro Git book)"
    url: "https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell"
---

# Branching and Merging — Parallel Work, Joined History

## The Concept: Multiple Timelines, One Project

A **branch** is a movable label on a commit — a *separate timeline* of work. The default branch is `main` (the "official" line). When you create a branch, you get your own timeline diverging from main; commits you make don't affect main until you **merge** them back.

Think of a tree: `main` is the trunk. Feature branches are limbs growing outward; each limb is its own timeline, and merging joins a limb back to the trunk.

Why branches matter:

- **Isolation** — half-finished work never breaks the shared main branch.
- **Parallelism** — multiple developers (or features) work simultaneously.
- **Safety** — experiments die with the branch; main stays clean.

## The Code Walkthrough

```bash
# ---- 1. Create and switch to a feature branch ----
git checkout -b feature/add-lessons     # create + switch in one command
git branch                              # list branches, '*' = current

# ---- 2. Work on it (normal flow) ----
git add . && git commit -m "Add lesson entities"
git add . && git commit -m "Wire the lesson repository"

# ---- 3. Switch back to main and merge the feature ----
git checkout main
git merge feature/add-lessons

# ---- 4. Delete the merged branch (it's done) ----
git branch -d feature/add-lessons
```

### Walking Through Each Part

**`git checkout -b <name>`** — creates a branch at the current commit and switches to it. Everything you commit now lands on the new branch; `main` doesn't move.

**Committing on the branch** — two commits (entities, repository) accumulate on `feature/add-lessons`. The feature is *work in progress* — isolated from main until merged.

**`git merge`** — joins the feature's commits into main. Two outcomes:

- **Fast-forward** — if main hasn't moved since the branch started, Git just moves main's label to the branch tip. History stays linear.
- **Merge commit** — if main *has* moved (someone else committed), Git combines both lines with a merge commit (a commit with two parents). History shows the join.

## Merge Conflicts — When Two Lines Disagree

A conflict happens when both timelines changed the *same lines* of the *same file*:

```bash
$ git merge feature/add-lessons
Auto-merging Course.java
CONFLICT (content): Merge conflict in Course.java
```

Git pauses the merge and marks the conflict **in the file**:

```java
<<<<<<< HEAD
private int minutes = 30;          // what main has
=======
private int minutes = 45;          // what the branch has
>>>>>>> feature/add-lessons
```

**The resolution process:**

```bash
# 1. Edit the file: keep one side, combine, or write something new:
private int minutes = 45;          // the resolved value

# 2. Remove the <<<<<<< ======= >>>>>>> markers

# 3. Tell Git you resolved it, and finish the merge:
git add Course.java
git commit -m "Merge feature/add-lessons (resolved minutes default)"
```

**Key facts about conflicts:**

- They're *normal*, not a disaster — merging divergent edits on the same lines happens.
- Git never resolves content conflicts itself (it can't know the intent); you decide.
- The conflict markers show *both* sides; you choose or blend.
- Resolution should be **tested** — a merge that compiles is a merge that works.

## The Golden Rules of Branching

1. **Never commit directly to `main`** — main stays releasable; all work lands via branches (see the workflows lesson).
2. **One branch per logical unit** — a feature, a bug fix, a chore. Named by intent: `feature/add-lessons`, `fix/payment-timeout`.
3. **Keep branches short-lived** — long-lived branches drift from main and conflict; merge/rebase frequently.
4. **Pull before you branch/merge** — start from the latest main; merge or rebase main into your branch often.
5. **Delete merged branches** — clutter hides the active work; `-d` deletes safely (only merged).

## Merge vs Rebase — The Two Ways to Integrate

```bash
# Merge: a join commit, preserves both timelines
git merge main                # on your branch: bring main's changes in

# Rebase: replay your commits on top of main — a clean linear history
git checkout feature
git rebase main               # your commits re-played onto main's tip
```

| | Merge | Rebase |
|---|---|---|
| History | Shows the join (merge commits) | Linear, clean |
| Reads like | "What actually happened" | "A tidy narrative" |
| Rewrites history | No | Yes (dangerous if shared) |
| Conflicts | Resolve once | Resolve per replayed commit |

The guidance: **merge for shared branches** (main), **rebase for local/feature work** (before sharing), and **never rebase shared/published branches** (you rewrite other people's history).

## Common Beginner Pitfalls

1. **Working directly on main** — every half-finished idea breaks the shared branch; use feature branches.
2. **Branching from a stale main** — the branch starts behind and conflicts immediately; `git pull`/`git fetch` first.
3. **Long-lived feature branches** — months of drift, merge conflicts everywhere; integrate frequently.
4. **Panicking at conflicts** — read the markers, resolve deliberately, test after; conflicts are routine.
5. **`git branch -D` on unmerged work** — uppercase `-D` *force-deletes*; the lowercase `-d` protects unmerged branches.
6. **Rebasing shared branches** — rewrites history others have; a coordination disaster.
7. **Forgetting to pull before push** — the remote moved; Git refuses (or requires a merge); pull/rebase first.

## Key Takeaways

- Branches are parallel timelines; main stays clean; merges join them.
- Fast-forward (no divergence) vs merge commit (divergence) — both fine.
- Conflicts happen when both sides edit the same lines — resolve by editing, removing markers, testing.
- Golden rules: never commit to main, short-lived branches, pull first, delete merged.
- Merge preserves history; rebase linearizes it; never rebase shared branches.
- Conflicts are routine — resolve calmly, test after.
