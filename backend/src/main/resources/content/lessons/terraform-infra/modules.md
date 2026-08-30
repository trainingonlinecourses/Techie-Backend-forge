---
title: Terraform Modules — Reusable Infrastructure Packages
module: terraform-infra
order: 4
minutes: 25
topics: ["modules", "reusability", "module sources", "outputs", "versioned modules"]
summary: A config that provisions one environment works — until you need the same stack in staging and prod, or a second team wants the same database patter...
docs:
  - title: "Modules (Terraform docs)"
    url: "https://developer.hashicorp.com/terraform/language/modules"
  - title: "Module Sources (Terraform docs)"
    url: "https://developer.hashicorp.com/terraform/language/modules/sources"
---

# Terraform Modules — Reusable Infrastructure Packages

## The Concept: The Function of Infrastructure

A config that provisions one environment works — until you need the same stack in staging *and* prod, or a second team wants the same database pattern. Copy-pasting config duplicates bugs and guarantees drift (fix it in one copy, forget the other). **Modules** are Terraform's answer: a *package* of resources with an input/output contract, reusable across environments and projects — the function of infrastructure code.

**The mental model:** a module is a function. It takes **inputs** (variables — "environment", "instance size", "db password"), does work (declares resources — a VPC + subnet + database + security groups), and returns **outputs** ("the db endpoint", "the security group id"). You call the function (a `module` block), pass arguments, and use the results. Same definition, different arguments per call — staging and prod are two calls to the same function.

## Anatomy of a Module

A module is just a directory of `.tf` files with variables (inputs), resources, and outputs:

```hcl
# modules/database/main.tf  — a reusable Postgres module
resource "aws_db_instance" "db" {
  identifier           = "${var.name}-${var.environment}"
  engine               = "postgres"
  engine_version       = var.engine_version
  instance_class       = var.instance_class
  allocated_storage    = var.allocated_storage
  db_name              = var.db_name
  username             = var.username
  password             = var.password
  skip_final_snapshot  = var.skip_final_snapshot
  tags = {
    Name        = "${var.name}-${var.environment}"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# modules/database/variables.tf — the INPUT CONTRACT:
variable "name" {
  description = "Short name used in resource identifiers"
  type        = string
}
variable "environment" {
  type = string
}
variable "engine_version" {
  type    = string
  default = "16.3"              # defaults make the module usable with few args
}
variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
}
variable "allocated_storage" {
  type    = number
  default = 20
}
variable "db_name"      { type = string }
variable "username"     { type = string }
variable "password"     { type = string, sensitive = true }
variable "skip_final_snapshot" { type = bool, default = false }

# modules/database/outputs.tf — the OUTPUT CONTRACT:
output "endpoint" {
  value       = aws_db_instance.db.endpoint
  description = "Database connection endpoint"
  sensitive   = true
}
output "security_group_id" {
  value = aws_db_instance.db.vpc_security_group_ids[0]
}
```

**Walking through it:** the module declares *what it needs* (variables — required ones without defaults), *what it builds* (the resources), and *what it returns* (outputs). The `description` fields are documentation the plan and IDE surface. The default values make the module ergonomic — callers override only what differs. The sensitive flag keeps the password out of plan output.

## Calling the Module: The Two Environments

```hcl
# main.tf — the ROOT module, composing the pieces:

module "database_staging" {
  source   = "./modules/database"     # local path (or a registry URL)
  name     = "academy"
  environment = "staging"
  db_name  = "academy"
  username = "academy_app"
  password = var.staging_db_password  # from a variable/secret store
}

module "database_prod" {
  source   = "./modules/database"
  name     = "academy"
  environment = "prod"
  instance_class = "db.t4g.large"     # bigger in prod
  db_name  = "academy"
  username = "academy_app"
  password = var.prod_db_password
}

# Use the module's OUTPUTS in other resources:
resource "aws_security_group_rule" "app_to_db" {
  type              = "ingress"
  from_port         = 5432
  to_port           = 5432
  protocol          = "tcp"
  security_group_id = aws_security_group.app_sg.id
  source_security_group_id = module.database_prod.security_group_id
}
```

**The payoff in two lines of comparison:** the same module, called twice with different arguments — staging gets the small instance class, prod the large; both get identical structure, identical tagging, identical behavior. And when the module improves (say, add `deletion_protection = true`), *both* environments get the fix on the next apply — no copy-paste, no drift.

## Module Sources: Local, Registry, Git

Modules are fetched from a **source**:

```hcl
# Local — relative path (the common internal pattern):
source = "./modules/database"

# Registry — the public HashiCorp registry (community/verified modules):
source = "terraform-aws-modules/vpc/aws"
version = "5.0.0"

# Git — your own versioned module repo:
source = "git::https://github.com/academy/terraform-modules.git//database?ref=v1.2.0"
```

The **version discipline**: internal modules referenced from Git (or the registry) get pinned with `ref`/`version` — so a change to the module doesn't silently change every caller until *you* choose to upgrade. This is the same contract as a library dependency: the module is versioned, and callers opt into versions.

## When to Make a Module (and When Not To)

**The anti-pattern:** making a module for every resource. One `aws_instance` in one place doesn't need a module — it's indirection without reuse.

**The right triggers:**

1. **The same stack appears twice** (staging + prod, two teams, two regions) — the classic case.
2. **A group of resources has a stable contract** — a database stack (DB + SG + subnet group), a service stack (EC2/K8s + LB + DNS), a VPC. Callers care about the *inputs and outputs*, not the internals.
3. **The team needs standardization** — a module *is* the enforced standard ("every database gets these tags, this backup setting, this deletion protection").

**The craft rules:** keep modules *small and composable* (one concern per module — "database", "load-balancer", not "everything"); document inputs/outputs (the `description` fields); version the module; and — the golden rule — **make the module's outputs the only interface**: callers should never reach into the module's internals.

## Module Testing and Maintenance

Modules are shared code — they deserve the same treatment:

- **Test in isolation** — a small `examples/basic` directory that calls the module with minimal inputs; `terraform plan`/`apply` it in CI against a throwaway environment.
- **Version and changelog** — tag releases (`v1.2.0`), document breaking changes (renamed variables = breaking; new optional variable = not).
- **Keep the interface stable** — add variables with defaults rather than renaming; add outputs rather than removing them. Callers depend on the contract.
- **Run `terraform fmt` and `validate`** — the linters of the language.

## Recap

Modules are the function abstraction of Terraform: a directory of resources with an input contract (variables), an output contract (outputs), and a source (local path, registry, or versioned Git). The same module called with different arguments builds staging and prod identically — eliminating copy-paste drift, standardizing tagging and safety settings, and turning "a database stack" into a one-line call. The discipline: module when something repeats or needs standardization; keep modules small and composable; version them; and treat outputs as the only interface. Terraform at scale is, in large part, a library of well-made modules — the infrastructure equivalent of clean, reusable functions.
