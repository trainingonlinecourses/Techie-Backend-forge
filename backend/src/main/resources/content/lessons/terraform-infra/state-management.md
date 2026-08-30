---
title: State Management — Remote State, Locking, and Drift
module: terraform-infra
order: 3
minutes: 25
topics: ["state", "remote state", "locking", "drift", "state commands", "backend"]
summary: Terraform decides "create vs update vs destroy" by comparing three things: your config (the blueprint), the state (what Terraform believes exists),...
docs:
  - title: "State (Terraform docs)"
    url: "https://developer.hashicorp.com/terraform/language/state"
  - title: "Remote State (Terraform docs)"
    url: "https://developer.hashicorp.com/terraform/language/state/remote"
---

# State Management — Remote State, Locking, and Drift

## The Concept: Terraform's Memory

Terraform decides "create vs update vs destroy" by comparing three things: your config (the blueprint), the **state** (what Terraform believes exists), and the real cloud (what actually exists). The state is the linchpin — and mismanaging it is the source of the scariest Terraform incidents. This lesson is about making state safe: remote storage, locking, and handling the drift that reality always introduces.

**The mental model:** state is Terraform's filing cabinet — one record per resource: "this declaration maps to this real object (ID `i-0abc123`), created with these attributes." When you run `plan`, Terraform opens the cabinet, compares each record to the config and to reality, and reports the differences. If two people share one cabinet (or worse, each has their *own* cabinet), the records diverge — and plans start proposing to destroy things that exist or duplicate things that don't.

## Why Local State Fails

The default backend is local: a `terraform.tfstate` JSON file in your working directory. It works for a solo experiment and fails at the first team member:

- **No sharing** — two engineers each have their own state file, so each plan sees a different "reality."
- **No locking** — two simultaneous applies race: both read the same state, both create the same resource, one wins, one errors (or worse, both "succeed" with one clobbering the other's record).
- **No history** — the local file has no versioning; a corrupted or deleted state file is unrecoverable without re-importing everything.

The fix is the **remote backend**: state lives in shared, versioned, *locked* storage.

## Remote State: The Team Requirement

```hcl
# The S3 backend — the classic AWS setup:
terraform {
  backend "s3" {
    bucket         = "academy-terraform-state"
    key            = "prod/terraform.tfstate"   # one key per environment/stack
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"     # the LOCK table
  }
}
```

**The pieces:**

- **The object store (S3, GCS, Azure Blob)** — state is a file in versioned storage. Versioning on the bucket gives you history: corrupt state → restore a previous version. `encrypt = true` protects the state (which contains resource metadata — and sometimes plaintext values).
- **The lock table (DynamoDB)** — Terraform acquires a lock before `apply` and releases it after. A second concurrent apply *blocks* (with a clear message) instead of racing. The lock table is what turns "two engineers, one cluster" from a race into a queue.
- **One key per scope** — `prod/terraform.tfstate`, `staging/terraform.tfstate`, each environment isolated, so a staging apply can never touch prod's state.

**The managed alternative:** **Terraform Cloud** (or OpenTofu-compatible equivalents) provides state hosting, locking, and history with zero infrastructure to build — the pragmatic choice for teams without a dedicated AWS setup. The principles are identical: remote, locked, versioned.

## The State Commands: Daily Life

```bash
# The daily commands:
terraform state list                    # what does Terraform think exists?
terraform state show aws_db_instance.academy_db   # one resource's details
terraform state rm aws_instance.old     # forget a resource (don't destroy it)
terraform state mv aws_instance.a aws_instance.b  # rename in state

# The refresh/import pair — handling reality:
terraform refresh                       # update state from reality (no changes)
terraform import aws_instance.app i-0abc123  # adopt an existing resource
```

**The three scenarios these serve:**

1. **A resource was created outside Terraform** (someone clicked the console). `terraform import` adopts it into state — Terraform now manages it. Without import, the next apply would *duplicate* it (Terraform thinks it doesn't exist).
2. **A resource was deleted outside Terraform** (someone deleted the instance in the console). `terraform plan` will propose recreating it — that's Terraform converging on the config. If the deletion was intentional, remove it from config *first*, then apply.
3. **A resource must move** (renamed, or split into another state file). `state mv` / `state rm` edit the records deliberately, before the next apply.

## Drift: When Reality Sneaks Away

**Drift** is the gap between state/reality and the config. It's inevitable — someone tweaks a security group in the console, an auto-scaling group replaces an instance, a managed service changes a setting. Terraform detects drift on every `plan` (it reads reality, not just state) — the question is what to *do* about it:

- **Intentional drift** — the console change should be kept: update the config to match, and apply (Terraform records the new reality).
- **Unintentional drift** — the console change should not exist: `apply` will revert it (Terraform converges back to the config).
- **The discipline:** all changes through Terraform, period. The console is for *emergency* intervention only — and every emergency intervention must be followed by a config update so state and config converge.

The warning sign to take seriously: a plan that proposes destroying resources you didn't expect to change. That's drift (or a misconfigured state) announcing itself — review it like a security alert.

## The State Safety Rules

1. **Remote state + locking from day one** — even for solo work (you'll thank yourself when you open a second terminal).
2. **Version the state bucket** — the undo button for corrupted state.
3. **Never edit state by hand** — use `terraform state ...` commands (or `import`); hand-editing JSON is how state gets corrupted.
4. **Separate environments** — separate keys/workspaces; staging must never be able to touch prod's state.
5. **Secrets in state** — state can contain plaintext values (some resources store attributes verbatim); protect the state location accordingly and prefer `sensitive` variables + secret stores.
6. **Back up the state** — the remote backend *is* the backup when versioned; without it, your state is one deletion away from chaos.

## Workspaces: State Slices for Environments

**Workspaces** are a lighter-weight state separation than separate keys: one backend, multiple state files, selected with `terraform workspace select prod`. The pattern `workspace = terraform.workspace` in configs lets one config express per-environment differences. The guidance: workspaces are fine for quick environment separation; separate *keys* (or separate directories/CI jobs) are cleaner for true environment isolation. Either way — the state must be remote, locked, and versioned.

## Recap

State is Terraform's memory: the record mapping your config to real resources, consulted on every plan and apply. Local state fails teams (no sharing, no locking, no history) — the fix is a **remote backend** (S3/GCS + DynamoDB lock, or Terraform Cloud): remote, locked, versioned, one key per environment. The daily commands (`state list`, `import`, `state rm/mv`) manage the records; **drift** — reality diverging from config — is detected every plan and resolved by deciding which side is intentional. The rules: never edit state by hand, never let two applies race, and review any plan that proposes unexpected destruction. State managed well is invisible; state managed poorly is how infrastructure disasters start.
