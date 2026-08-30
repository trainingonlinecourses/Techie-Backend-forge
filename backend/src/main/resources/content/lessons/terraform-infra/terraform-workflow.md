---
title: Terraform Workflows — CI, Plan Gates, and Team Practices
module: terraform-infra
order: 5
minutes: 25
topics: ["CI/CD", "plan gate", "terraform cloud", "pull request workflow", "team practices", "security"]
summary: The previous lessons made infrastructure declarable. This lesson makes it governable: the workflow that turns "someone ran terraform apply" into "a...
docs:
  - title: "Terraform Cloud / CI Integration"
    url: "https://developer.hashicorp.com/terraform/cloud-docs"
  - title: "Drift Detection and Sentinel Policies"
    url: "https://developer.hashicorp.com/terraform/cloud-docs/policy-enforcement"
---

# Terraform Workflows — CI, Plan Gates, and Team Practices

## The Concept: Infrastructure Changes Are Code Changes

The previous lessons made infrastructure *declarable*. This lesson makes it *governable*: the workflow that turns "someone ran terraform apply" into "a reviewed, tested, approved change, exactly like a code PR." The professional Terraform team runs every infrastructure change through the same pipeline as application code — **plan in CI, review the plan, apply with approval** — and enforces policies so "it works" isn't the only standard.

**The mental model:** treat `terraform apply` the way you treat `git push to main` — never done by hand, always behind a review gate. The pipeline: a PR changes config → CI runs `terraform plan` → the *plan output* is attached to the PR (the reviewer's real job: reading the diff of what will change in the cloud) → merge → CI runs `terraform apply` with the approved plan → state updates. Every change is auditable, revertible, and reviewed — infrastructure as code, *including the process*.

## The CI Pipeline: Plan and Apply as Steps

```yaml
# .github/workflows/terraform.yml — the skeleton of a plan-gated workflow
name: terraform
on:
  pull_request:                      # PLAN on every PR
    paths: ["infra/**"]
  push:
    branches: [main]                 # APPLY on merge to main
    paths: ["infra/**"]

jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.8.0
      - name: Init
        run: terraform init
        env:
          # Credentials for the remote state backend:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      - name: Plan
        id: plan
        run: terraform plan -no-color -out=tfplan
        env:
          TF_VAR_db_password: ${{ secrets.TF_VAR_DB_PASSWORD }}
      # Make the PLAN OUTPUT the PR's review artifact:
      - uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const plan = fs.readFileSync('plan.txt', 'utf8');
            // post the plan as a PR comment — this is what reviewers read

  apply:
    needs: plan                      # apply only after plan passed review
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - name: Apply
        run: terraform apply -auto-approve tfplan
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          TF_VAR_db_password: ${{ secrets.TF_VAR_DB_PASSWORD }}
```

**The two-phase design is the point:** the **plan job** runs on every PR and *posts the plan output to the PR* — the reviewer reads "aws_db_instance.academy_db will be updated: instance_class t4g.micro → t4g.large" exactly like reading a code diff. The **apply job** runs only on merge to main, reuses the reviewed plan (`-out=tfplan` captures it), and applies with `-auto-approve` (the approval *is* the PR merge). Secrets flow through the CI secret store, never through the repo. This is the standard professional shape — and it's precisely what **Terraform Cloud / OpenTofu** provide as a managed service (plan/apply runs, plan comments on PRs, state hosting, and **Sentinel policy enforcement** built in).

## Policy as Code: The Guardrails

The plan gate protects *review*, but humans miss things. **Policy as Code** automates the guardrails — Sentinel (Terraform Cloud) or OPA/Conftest (open source) evaluate the plan against rules *before apply*:

```hcl
# A Sentinel policy: every resource must carry the team's tags.
main = rule {
  all tfplan.resource_changes as _, rc {
    all rc.change.after.tags as key, value {
      key == "Environment" or key == "Project" or key == "ManagedBy"
    }
  }
}

# Another: no expensive instance classes outside prod.
```

**The rules teams actually encode:** mandatory tags, forbidden instance types, required encryption, mandatory backups, no public S3 buckets, no `0.0.0.0/0` security-group rules. The benefit is twofold: **prevention** (a misconfigured resource is rejected before it exists) and **standardization** (the policies *are* the team's infrastructure standards, enforced mechanically instead of via review comments).

## The Environment Strategy

How do the environments get built? The common patterns:

1. **Workspaces** (Terraform Cloud) — one config, several state slices; `workspace = terraform.workspace` varies the config.
2. **Separate directories/stacks** — `infra/staging/`, `infra/prod/` each with their own root module and state key; CI runs each independently. The cleanest isolation.
3. **Dynamic environments from PRs** — a preview environment per PR (the full-stack analog of a preview deploy): `terraform apply` with `environment = pr-123`, `terraform destroy` when the PR closes.

The professional shape is *one pipeline, many environments*: the same reviewed workflow applies to staging first (the pipeline's own integration test), then prod — with the prod apply gated additionally (environment approval in Terraform Cloud, or a separate protected branch).

## The Destroy Discipline

`terraform destroy` deletes *everything* in the state — the scariest command in the toolset. The practices that make it safe:

- **Never run destroy in the apply pipeline.** Destroy is a separate, deliberate, human-gated action (or part of preview-environment cleanup).
- **State separation** — a destroy of the staging state file can never touch prod's resources because it never *sees* them.
- **`prevent_destroy` and `lifecycle` blocks** — mark critical resources: `lifecycle { prevent_destroy = true }` on a database makes Terraform *refuse* to destroy it even when the config demands it. The last line of defense.
- **Dry-run discipline** — `terraform plan -destroy` shows the full destruction list *before* anything happens. Read it. The only surprise in a destroy should be "I didn't expect that."

## Secrets in the Workflow

The complete secret-handling stack for Terraform:

1. **Never in config or state-by-hand** — variables with `sensitive = true` keep values out of plan/log output.
2. **CI secret store** — `TF_VAR_*` from the pipeline's secret store (as in the workflow above).
3. **Secret managers for the real values** — AWS Secrets Manager / Vault; a data source reads them at plan/apply time, or the values flow from the app's own secret infrastructure.
4. **State encryption** — the remote backend encrypts at rest; the state may hold resource attributes verbatim.

## The Team Checklist

1. **Plan in CI on every PR** — the plan output is the review artifact.
2. **Apply only on merge** — with the reviewed plan, never a fresh unplanned apply.
3. **Secrets through the secret store** — never in the repo.
4. **Policy as code** for the guardrails tags, sizes, encryption.
5. **Environment isolation** — separate state keys; staging before prod.
6. **Destroy discipline** — deliberate, gated, `prevent_destroy` on the criticals.
7. **Locked remote state** — the foundation everything else stands on.

## Recap

The Terraform workflow treats infrastructure changes as code changes: CI runs `terraform plan` on every PR and posts the plan for review; merge runs `terraform apply` with the reviewed plan; secrets come from the pipeline's secret store; and policy-as-code (Sentinel/Conftest) enforces the guardrails mechanically. Environments are separate state scopes moving through the same pipeline, destroys are deliberate and gated (with `prevent_destroy` as the last defense), and everything stands on locked, remote, versioned state. The takeaway is cultural as much as technical: the tool already made infrastructure declarable — the workflow makes it *governable*, which is what turns "it worked on my machine" into "it was reviewed, tested, and approved for production."
