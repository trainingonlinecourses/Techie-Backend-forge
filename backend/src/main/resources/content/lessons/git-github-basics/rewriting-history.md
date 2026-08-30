---
title: Rewriting History — Amend, Squash, and Rebase -i
module: git-github-basics
order: 4
minutes: 25
topics: ["git amend", "squash", "interactive rebase", "history rewriting", "reflog"]
docs:
  - title: "Rewriting history (Pro Git book)"
    url: "https://git-scm.com/book/en/v2/Git-Tools-Rewriting-History"
summary: Your published history (on the remote, shared with the team) is set in stone. But your local, unpublished history is still clay — you can reshape i...
---

# Rewriting History — Amend, Squash, and Rebase -i

## The Concept: Your Local History Is Clay

Your *published* history (on the remote, shared with the team) is set in stone. But your **local, unpublished** history is still clay — you can reshape it before it reaches anyone else. Rewriting is about *presentation*: turning a messy sequence of "wip", "fix typo", "oops" commits into a clean, readable story.

The three moves:

1. **`git commit --amend`** — fix the *last* commit (message or content).
2. **`git rebase -i`** — reorder, squash, reword, and drop commits (interactive).
3. **`git reset` (soft/mixed)** — un-commit and redo.

The **golden rule** governs everything: **never rewrite history that others have** — anything already pushed/shared must not be rewritten (it would break everyone's copies). Rewrite only *your own, unpushed* commits.

## The Code Walkthrough

### 1. Amend — Fix the last commit

```bash
git add forgotten-file.java          # the change you forgot
git commit --amend                  # fold it INTO the last commit (new message editor)
# Result: one commit instead of two — "Add user login" + "forgot the repository" -> one clean commit
```

`--amend` replaces the last commit with a new one containing the added changes (and a new message if you edit it). **Only safe if the commit was never pushed.**

### 2. Interactive rebase — Reshape several commits

```bash
# You have 4 messy commits; you want 2 clean ones:
git rebase -i HEAD~4

# An editor opens listing the commits, oldest first:
# pick abc123 wip: lesson entities
# pick def456 add repository
# pick 789ghi fix typo in repository
# pick 123jkl oops forgot the import

# Rewrite the list:
# pick   abc123 wip: lesson entities
# squash def456 add repository      <- fold into the previous commit
# squash 789ghi fix typo            <- fold again
# fixup 123jkl oops forgot import   <- fold, DISCARD its message
#
# Save & close -> a message editor asks for the combined commit message:
# "Add lesson entities and repository"
```

### The rebase -i verbs

| Verb | Short | Meaning |
|---|---|---|
| `pick` | `p` | Keep the commit as-is |
| `reword` | `r` | Keep the changes, edit the message |
| `squash` | `s` | Fold into the *previous* commit, combine messages |
| `fixup` | `f` | Fold into the previous, discard this message |
| `drop` | `d` | Delete the commit entirely |
| `edit` | `e` | Stop and let you change the commit |

### 3. Reset — Un-commit and redo

```bash
git reset --soft HEAD~1      # undo the last commit, KEEP changes staged
git reset HEAD~1             # undo, keep changes unstaged (the "mixed" default)
git reset --hard HEAD~1      # DANGER: undo AND discard the changes
```

`--soft` is the gentle one: "uncommit but keep everything" — useful when you committed too early. `--hard` throws the changes away — the nuclear option.

## The Workflow: Messy Local, Clean Published

```
Your local history (messy):
  wip lesson entities
  fix typo
  add repository
  oops import
  actually the dto too

Your published history (clean — after squash):
  Add lesson entities and repository (one commit, meaningful message)
```

The discipline: **work messily, publish cleanly.** Commit whenever you need a checkpoint; before pushing (or before the pull request), `rebase -i` to squash the noise into coherent units. Reviewers see the story, not the struggle.

## The Reflog — The Safety Net

Rewriting history feels dangerous — and `git rebase -i` can go wrong. The **reflog** is the escape hatch: Git logs *every* movement of your branch labels, including the ones you "undid":

```bash
git reflog
# abc123 HEAD@{0}: rebase (finish): ...
# def456 HEAD@{1}: rebase (start): ...
# 789ghi HEAD@{2}: commit: oops import
# ...

# If a rewrite went wrong, jump back to where you were:
git reset --hard 789ghi        # back to before the rebase
```

The reflog means **almost nothing is unrecoverable** — even a botched `--hard` or a bad rebase can be undone by finding the pre-disaster commit in the reflog. This is why rewriting, with care, is safe: the safety net exists.

## The Rules of Rewriting

| Situation | Allowed? |
|---|---|
| Amend/squash your own **unpushed** commits | ✅ Safe |
| Rebase your branch onto updated main | ✅ Safe (your commits only) |
| Rewrite commits **already pushed/shared** | ❌ Breaks everyone's copies |
| Force-push your own unshared feature branch | ⚠️ Rarely OK (your branch, no collaborators) |
| Force-push shared main | ❌ Never |

**The test before rewriting:** *has anyone else pulled this history?* If yes — don't rewrite; add a new commit instead. If no — reshape freely.

## Common Beginner Pitfalls

1. **Amending a pushed commit** — the push rejects (or you force-push and break teammates). Amend only unpushed commits.
2. **Squashing everything into one commit** — a 5000-line mega-commit is as unreadable as 40 "wip"s; group into coherent units.
3. **`rebase -i` confusion** — the list is *oldest first*; reordering accidentally reorders your work's logic. Read the list carefully.
4. **Force-pushing shared branches** — the history rewrite that breaks the team. Never.
5. **Panicking after a botched rebase** — the reflog has your back; `git reflog` then `git reset --hard <hash>`.
6. **Rewriting "just the message" of shared commits** — a message change is still a rewrite (new hash); it breaks others' references.
7. **Using `--hard` casually** — it discards changes; prefer `--soft`/mixed unless you truly want them gone.

## Key Takeaways

- Rewriting reshapes *local, unpublished* history: amend the last commit, rebase -i the last several.
- `squash`/`fixup` fold commits together; `reword` fixes messages; `drop` removes.
- `reset --soft` uncommits keeping changes; `--hard` discards.
- The golden rule: never rewrite history others have — push your clean story, then it's stone.
- The reflog is the safety net — almost every rewrite mistake is recoverable.
- Work messily, publish cleanly: commit for checkpoints, squash for the pull request.
