---
title: GitHub Actions Fundamentals
module: cicd-devops
order: 1
minutes: 25
topics: ["workflows", "jobs", "steps", "actions", "secrets", "triggers", "runners"]
summary: CI/CD is the pipeline that turns a push into a deployed artifact with tests run, secrets handled, and failures reported. GitHub Actions is the most...
docs:
  - title: "GitHub Actions docs"
    url: "https://docs.github.com/en/actions"
---

# GitHub Actions Fundamentals

CI/CD is the pipeline that turns a push into a deployed artifact with tests run, secrets handled, and failures reported. GitHub Actions is the most common way Spring projects run it, because the trigger, the pipeline, and the result all live next to the code.

## Anatomy of a Workflow

A workflow is a YAML file in `.github/workflows/`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'
      - name: Build and test
        run: ./mvnw -B verify
```

Key concepts:

| Concept | Meaning |
|---------|---------|
| `on` | Event that triggers the workflow |
| `jobs` | Independent units of work (can run in parallel) |
| `runs-on` | Runner image (ubuntu, windows, macos, self-hosted) |
| `steps` | Ordered commands inside a job |
| `uses` | Reuse a published action |
| `run` | Shell command executed directly |

## Triggers

```yaml
on:
  push:                          # any push
  pull_request:
    branches: [main]             # PRs targeting main
  workflow_dispatch:             # manual trigger (Actions tab → Run workflow)
  schedule:
    - cron: '0 3 * * *'          # nightly
  release:
    types: [published]
```

### Path Filters

Don't rebuild the world on a README change:

```yaml
on:
  push:
    paths:
      - 'backend/**'
      - 'frontend/**'
      - '.github/workflows/**'
```

### Branch Filters

```yaml
on:
  push:
    branches:
      - main
      - 'release/**'
    tags:
      - 'v*'
```

## Jobs: Parallel and Dependent

```yaml
jobs:
  backend:
    runs-on: ubuntu-latest
    steps: [ ... mvn verify ... ]

  frontend:
    runs-on: ubuntu-latest
    steps: [ ... npm ci && npm run build ... ]

  deploy:
    needs: [backend, frontend]     # runs only after both pass
    runs-on: ubuntu-latest
    steps: [ ... deploy ... ]
```

`needs` creates the dependency graph: `backend` and `frontend` run in parallel; `deploy` waits for both. Job failures stop dependent jobs automatically.

## Build Matrices

Test across versions/platforms with one job definition:

```yaml
strategy:
  matrix:
    java: ['17', '21']
    os: [ubuntu-latest, windows-latest]

runs-on: ${{ matrix.os }}
steps:
  - uses: actions/setup-java@v4
    with:
      distribution: temurin
      java-version: ${{ matrix.java }}
  - run: ./mvnw -B verify
```

This runs 2×2 = 4 builds. Use matrices for supported-versions testing; keep the deploy job matrix-free.

## Secrets and Environment

Never commit secrets. Store them in **Settings → Secrets and variables → Actions**:

```yaml
- name: Deploy to Render
  env:
    RENDER_API_KEY: ${{ secrets.RENDER_API_KEY }}
    SERVICE_ID: ${{ secrets.RENDER_SERVICE_ID }}
  run: |
    curl -X POST "https://api.render.com/v1/services/$SERVICE_ID/deploys" \
      -H "Authorization: Bearer $RENDER_API_KEY"
```

Rules:
- Reference `secrets.NAME` — never literal values
- Use environment-scoped secrets for prod vs staging:

```yaml
jobs:
  deploy-prod:
    environment: production
    steps:
      - run: deploy.sh
        env:
          TOKEN: ${{ secrets.PROD_TOKEN }}
```

- Add a **secret scanning + deny rule** so a leaked key blocks the merge:

```yaml
# .github/actions/check-for-secrets/action.yml or a step
- name: Block leaked keys
  run: |
    if grep -rE "sk-[A-Za-z0-9]{20}" --include="*.java" --include="*.yml" .; then
      echo "Secrets found in repo" && exit 1
    fi
```

## Caching: Don't Redownload the World

```yaml
- name: Cache Maven dependencies
  uses: actions/cache@v4
  with:
    path: ~/.m2/repository
    key: ${{ runner.os }}-maven-${{ hashFiles('backend/pom.xml') }}
    restore-keys: |
      ${{ runner.os }}-maven-
```

```yaml
- name: Cache npm dependencies
  uses: actions/cache@v4
  with:
    path: frontend/node_modules
    key: ${{ runner.os }}-npm-${{ hashFiles('frontend/package-lock.json') }}
```

Keyed on the lockfile hash, the cache invalidates exactly when dependencies change.

## Artifacts: Passing Files Between Jobs

Upload build output from one job, download in another:

```yaml
- name: Upload jar
  uses: actions/upload-artifact@v4
  with:
    name: backend-jar
    path: backend/target/*.jar

# in the deploy job:
- name: Download jar
  uses: actions/download-artifact@v4
  with:
    name: backend-jar
```

## Conditional Steps

```yaml
- name: Run on main only
  if: github.ref == 'refs/heads/main'

- name: Skip on forks
  if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository

- name: Always notify (even on failure)
  if: always()
```

The `always()` condition is how failure notifications happen — without it, a failed job skips the notification step entirely.

## A Complete Spring CI Pipeline

```yaml
name: CI

on:
  push: { branches: [main] }
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '21', cache: maven }
      - name: Verify
        run: cd backend && ./mvnw -B verify

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: frontend/package-lock.json }
      - name: Build
        run: cd frontend && npm ci && npm run build

  deploy:
    needs: [backend, frontend]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Render deploy
        env:
          RENDER_API_KEY: ${{ secrets.RENDER_API_KEY }}
        run: |
          curl -X POST "https://api.render.com/v1/services/${{ vars.RENDER_SERVICE_ID }}/deploys" \
            -H "Authorization: Bearer $RENDER_API_KEY" \
            -H "Content-Type: application/json"
```

`concurrency` with `cancel-in-progress: true` stops a stale run when a newer push lands — saving minutes and preventing deploy races.

## Summary

| Concept | Key idea |
|---------|----------|
| Trigger | Push, PR, schedule, dispatch |
| Jobs | Parallel units; `needs` builds the DAG |
| Steps | Commands + reusable actions |
| Secrets | `${{ secrets.X }}`, environment-scoped |
| Cache | Key on lockfiles; restore on miss |
| Artifacts | Pass jars/coverage between jobs |
| Concurrency | Cancel stale runs on new pushes |

CI is the contract between the repo and production: *every push is verified the same way*. The next lessons cover the Docker pipeline, Kubernetes deployment, and zero-downtime release strategies.
