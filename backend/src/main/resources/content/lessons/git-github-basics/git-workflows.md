---
title: Git Workflows — How Teams Actually Use Git
module: git-github-basics
order: 5
minutes: 26
topics: ["GitHub Flow", "Git Flow", "pull requests", "code review", "CI", "trunk-based development"]
summary: Git gives you branches, merges, and remotes — but how a team uses them is the workflow: which branches exist, when things merge, who reviews, where...
docs:
  - title: "GitHub Flow"
    url: "https://docs.github.com/en/get-started/using-github/github-flow"
---

# Git Workflows — How Teams Actually Use Git

## The Concept: Git Is a Tool; the Workflow Is the Agreement

Git gives you branches, merges, and remotes — but *how a team uses them* is the **workflow**: which branches exist, when things merge, who reviews, where CI runs. The workflow is the team's social contract — and it matters more than any single Git command.

The three mainstream workflows:

| Workflow | Model | Best for |
|---|---|---|
| **GitHub Flow** | One `main` + short-lived feature branches + PRs | Most teams (simple, fast) |
| **Git Flow** | `main` + `develop` + `feature`/`release`/`hotfix` branches | Scheduled releases, mature products |
| **Trunk-based** | Everyone commits to `main` (short branches, feature flags) | CI/CD-heavy, deploy-fast teams |

This lesson walks GitHub Flow (the modern default) in depth, then the trade-offs.

## GitHub Flow — The Ten-Minute Loop

```
1. Branch      git checkout -b feature/lesson-search
2. Commit      (small commits as you work)
3. Push        git push -u origin feature/lesson-search
4. Pull request  (open on GitHub: describe the change)
5. CI runs       (build + tests on the branch — this academy does exactly this)
6. Review       (a teammate approves or requests changes)
7. Merge        (into main — often squash-merge for a clean history)
8. Deploy       (main is deployable; the pipeline ships it)
```

### Why This Works

- **Main is always releasable** — nothing lands without passing CI and review.
- **The PR is the unit of collaboration** — code, tests, discussion, and CI results in one place.
- **Small, frequent PRs** — each is easy to review and merge; integration problems surface early.
- **Review happens on the branch** — main never contains unreviewed code.

## The Pull Request Lifecycle

```markdown
## What
Adds lesson search to the curriculum API.

## Why
Students need to find topics by keyword (issue #42).

## How
- New /api/content/search endpoint
- Full-text index on lesson titles
- Frontend search box wired to it

## Testing
- Unit: search service tests
- Integration: endpoint returns matches
- Manual: curl against local build

## Screenshots
[before/after]
```

The PR description *is* the documentation of the change: what, why, how, and how it was tested. Reviewers read the description before the diff.

## The Review — What Reviewers Look For

| Dimension | Questions |
|---|---|
| Correctness | Does it do what the PR says? Edge cases? |
| Security | Input validation? Secrets? Authz on the new endpoint? |
| Style/consistency | Matches the project's conventions? |
| Testability | Are tests meaningful? Is the logic testable? |
| Scope | Does the PR do *one* thing? |
| Performance | N+1? Unnecessary work in hot paths? |

The reviewer's job isn't perfection — it's catching the issues the author can't see. **Small PRs get real reviews; giant PRs get rubber stamps.**

## Merge Strategies — What "Merge" Means on GitHub

| Strategy | Result | Use when |
|---|---|---|
| **Merge commit** | A join commit; both histories visible | Preserving the exact story |
| **Squash and merge** | All branch commits → one commit on main | Clean linear main (the common choice) |
| **Rebase and merge** | Branch commits replayed onto main | Linear history, keeping individual commits |

Most teams use **squash and merge**: the branch's messy internal commits collapse into one coherent commit on main (combining with the rewriting lesson: the PR shows the story; main stores the summary).

## Git Flow — When Releases Are a Cadence

```
main      --o-----------------o-----------o--   (releases only)
develop   ----o-----o-----o-----o-----o-----    (integration branch)
feature       \-o-/   \-o-/                      (from develop, into develop)
release               \-----o-----o/             (from develop, into main)
hotfix                      \-o/                 (from main, into main+develop)
```

- `main` holds **releases** (tagged versions).
- `develop` is the integration branch for features.
- `release/*` stabilizes a version before shipping.
- `hotfix/*` patches production directly from main.

Git Flow fits *scheduled releases* (a version every few weeks). Its cost: more branches, more merging, more ceremony — overkill for continuous-deploy teams.

## Trunk-Based Development

- Everyone works on **short-lived branches** (hours–days) off `main`, or commits directly.
- **Feature flags** hide incomplete work behind config instead of hiding it on branches.
- Merges are constant and tiny; CI/CD deploys every merge.

Trunk-based is the GitHub Flow extreme: maximal integration frequency, minimal branching. It requires disciplined CI/CD and feature-flag hygiene — the payoff is that "main is always deployable" becomes literally true.

## Choosing a Workflow

| You have | Workflow |
|---|---|
| A small team, deploying continuously | GitHub Flow |
| Scheduled releases, long-lived versions | Git Flow |
| A mature CI/CD pipeline, deploy-fast culture | Trunk-based |
| External contributors | GitHub Flow + branch protection |

**The pragmatic rule:** start with GitHub Flow — it's simple, safe, and scales to most teams. Adopt more ceremony only when the release process demands it.

## The Branch Protection Checklist

Protect `main` in the repo settings:

- [ ] Require pull requests before merging.
- [ ] Require at least one approving review.
- [ ] Require CI (build + tests) to pass.
- [ ] Require up-to-date branches (rebase before merge).
- [ ] No direct pushes to main (admins included, or not — team decision).
- [ ] Require conversation resolution (resolved comments).

This academy's repo demonstrates the pattern: CI builds and tests on every push; the deployable main is the result of protected, reviewed merges.

## Common Beginner Pitfalls

1. **Huge PRs** — 4,000-line diffs get rubber-stamped and break everything at merge; keep PRs small and focused.
2. **Review theater** — approving without reading; the review is the safety net, not a formality.
3. **Merging without CI** — broken main, broken everyone; CI gates the merge.
4. **Feature branches that live for months** — constant conflicts; integrate frequently.
5. **Git Flow for a two-person startup** — ceremony without benefit; match the workflow to the team.
6. **Squash-merging everything** — loses the intermediate history some teams need; pick the strategy per repo and be consistent.
7. **Unreviewed direct commits to main** — the exact failure mode branch protection prevents.

## Key Takeaways

- The workflow is the team's agreement: branch model, PR process, review rules, CI gates.
- GitHub Flow: feature branch → PR → CI → review → squash-merge → deploy. Main is always releasable.
- The PR description is the change's documentation: what, why, how, testing.
- Squash-merge keeps main linear; merge-commit preserves the full story.
- Git Flow fits scheduled releases; trunk-based fits fast CI/CD cultures.
- Protect main: require reviews, CI, and up-to-date branches.
- Start with GitHub Flow; add ceremony only when releases demand it.
