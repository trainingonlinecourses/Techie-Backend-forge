---
title: Remotes, Push, and Pull — Sharing History
module: git-github-basics
order: 3
minutes: 24
topics: ["remote", "push", "pull", "fetch", "origin", "GitHub", "clone"]
summary: So far, Git was local: your repository, your history, on your machine. Remotes connect your repo to a shared copy on a server (GitHub, GitLab, Rend...
docs:
  - title: "Working with remotes (Pro Git book)"
    url: "https://git-scm.com/book/en/v2/Git-Basics-Working-with-Remotes"
---

# Remotes, Push, and Pull — Sharing History

## The Concept: Your Local Copy, Their Remote Copy

So far, Git was local: your repository, your history, on your machine. **Remotes** connect your repo to a shared copy on a server (GitHub, GitLab, Render's Git integration) — the hub everyone pushes to and pulls from.

The mental model: **your local repository and the remote are two copies of the same history.** You *push* your commits to the remote (sharing them), and *pull* the remote's commits down (incorporating others' work). The remote is usually called `origin` — the canonical shared copy.

Think of a shared notebook: everyone has their own copy. When you finish a section, you mail your copy's new pages to the central notebook (push); before you start, you take the central notebook's latest pages (pull) so you're working from the current state.

## The Code Walkthrough

```bash
# ---- 1. Get a copy (clone) or connect an existing repo ----
git clone https://github.com/trainingonlinecourses/Techie-Backend-forge.git
#   clones the repo AND sets up 'origin' automatically

# ---- 2. See your remotes ----
git remote -v
# origin  https://github.com/... (fetch)
# origin  https://github.com/... (push)

# ---- 3. The daily rhythm ----
git pull origin main             # 1. bring the latest main down (fetch + merge)
git checkout -b my-feature
# ...work, commit...
git push -u origin my-feature    # 2. publish the branch
# -u sets the upstream: future `git push` knows where to go

# ---- 4. Pushing after rebasing/committing ----
git add -A && git commit -m "finish feature"
git push                        # now goes to origin/my-feature (upstream set)
```

### Walking Through Each Part

**`git clone`** — downloads the repo (including *all* history) and configures `origin` automatically. One command, and you're a participant in the shared history.

**`git pull` = `git fetch` + `git merge`** — two steps in one: `fetch` downloads the remote's new commits (updating your view of `origin/main`), and `merge` integrates them into your branch. The shorthand `git pull origin main` fetches and merges main into your current branch.

**`git push -u origin my-feature`** — uploads your commits and sets the *upstream*: from now on, plain `git push` on this branch goes to `origin/my-feature`. The `-u` flag is the "remember this pairing" switch — you set it once per new branch.

## Fetch vs Pull — The Distinction

| Command | What it does | When |
|---|---|---|
| `git fetch` | Downloads remote commits, **doesn't change your work** | Inspect first (`git log origin/main`) |
| `git pull` | Fetch **+ merge** into your branch | Ready to integrate |
| `git push` | Uploads your commits to the remote | Sharing work |

**The "pull before push" rule:** if the remote has commits you don't have (a teammate pushed), Git refuses your push (non-fast-forward). The fix: `git pull --rebase` (replay your commits on top of theirs) or `git pull` (merge), then push. Always integrate the remote's work before pushing yours.

## The Push Workflow That Keeps Main Safe

```
1. git checkout main && git pull     # main is current
2. git checkout -b feature/x         # new branch from current main
3. ...work, commit, commit...        # isolated work
4. git push -u origin feature/x      # publish the branch
5. Open a pull request on GitHub     # review + merge into main
```

The remote main is **protected**: work lands through pull requests (reviewed, tested by CI), never by pushing directly to main. This is the collaboration model — and it's exactly how this academy's repo is managed (CI builds + tests run on the PR before merge).

## When Push Goes Wrong

```bash
$ git push
! [rejected] main -> main (non-fast-forward)
```

**Why:** the remote has commits you don't have. **Fix:**

```bash
git pull --rebase origin main     # replay your commits on top of the remote
# resolve any conflicts, then:
git push origin main
```

**Never `git push --force`** on shared branches — force-push *overwrites* the remote's history, silently destroying others' commits. The one legitimate use is after a deliberate history rewrite of *your own unshared* branch.

## Common Beginner Pitfalls

1. **Pushing directly to shared main** — the "no one saw the tests fail" classic; use branches + pull requests.
2. **`git push --force` on shared branches** — destroys teammates' work; only force-push your own unshared branches.
3. **Forgetting to pull before push** — rejected pushes are routine; pull --rebase first.
4. **Never pulling** — working from a weeks-old main; everything conflicts.
5. **Pushing secrets** — a pushed commit with `.env` is in the shared history forever; check before pushing, scrub after.
6. **Confusing fetch and pull** — fetch only *downloads* (safe to inspect); pull *integrates*.
7. **Clone vs init confusion** — `clone` sets up origin; an `init`-ed repo needs `git remote add origin <url>`.

## Key Takeaways

- Remotes are shared copies of the history; `origin` is the canonical one.
- `push` uploads your commits; `pull` (fetch + merge) integrates the remote's.
- Pull before push — integrate the remote's work first (rebase preferred).
- Publish via branches + pull requests; keep shared main protected.
- Never force-push shared branches; check for secrets before pushing.
- The rhythm: pull → branch → work → commit → push → pull request.
