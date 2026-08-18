---
title: Terraform Basics — Infrastructure as Code
module: terraform-infra
order: 1
minutes: 26
topics: ["Terraform", "Infrastructure as Code", "providers", "resources", "HCL", "plan apply"]
docs:
  - title: "Terraform Introduction (developer.hashicorp.com)"
    url: "https://developer.hashicorp.com/terraform/intro"
  - title: "Terraform Language Documentation"
    url: "https://developer.hashicorp.com/terraform/language"
---

# Terraform Basics — Infrastructure as Code

## The Concept: Infrastructure You Can Review, Version, and Reproduce

Clicking through a cloud console to create servers, databases, and load balancers is fast — and unmanageable: nobody can review your clicks, reproduce your environment, or undo them. **Terraform** is the industry-standard **Infrastructure as Code (IaC)** tool: you *declare* your infrastructure (VPCs, instances, databases, DNS) in readable config files, and Terraform *makes the real world match your declaration* — creating, updating, or deleting cloud resources to converge on the declared state.

**The mental model:** the cloud console is a control panel with hundreds of switches; Terraform is the *blueprint* plus an automated electrician. You write the blueprint (HCL config): "I want one Postgres instance, this VPC, these two app servers." The electrician (Terraform) compares the blueprint to the current wiring (the real cloud), reports the difference (`plan`), and — on your approval — makes the wiring match (`apply`). Blueprints are versionable, reviewable, and reproducible; clicks are not.

**Why it matters for a Spring Boot developer:** deploying your app to production means provisioning infrastructure — a database, a host (or K8s cluster), DNS, secrets. Terraform is how teams do that *deliberately*: the same config that built staging builds prod, a pull request reviews what will change, and `terraform destroy` tears it all down cleanly. It's the deployment half of "build, test, deploy" done right.

## The Core Concepts

- **HCL (HashiCorp Configuration Language)** — the declarative config syntax (`.tf` files).
- **Provider** — a plugin that translates Terraform's declarations into a specific platform's API (AWS, GCP, Azure, Kubernetes, Render, etc.).
- **Resource** — a piece of infrastructure: `aws_db_instance`, `kubernetes_deployment`, `render_service`.
- **State** — Terraform's record of what currently exists (a JSON file, or better, remote state in S3/Terraform Cloud). The blueprint + state + the real world are the three inputs to every decision.
- **Plan / Apply** — the two-phase workflow: `plan` shows the diff; `apply` executes it.

## Your First Configuration, Line by Line

```hcl
# main.tf

# 1. Which provider, what version, and how to authenticate.
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # Remote state — so the whole team shares the source of truth:
  backend "s3" {
    bucket = "academy-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "us-east-1"
  }
}

# 2. The provider itself. Region + credentials (from env/role, never hardcoded).
provider "aws" {
  region = "us-east-1"
}

# 3. A RESOURCE — a real cloud object: a Postgres database.
resource "aws_db_instance" "academy_db" {
  identifier           = "academy-postgres"
  engine               = "postgres"
  engine_version       = "16.3"
  instance_class       = "db.t4g.micro"
  allocated_storage    = 20
  db_name              = "academy"
  username             = "academy_app"
  # NEVER commit real passwords — reference a variable or secret store:
  password             = var.db_password
  skip_final_snapshot  = false
  final_snapshot_identifier = "academy-db-final"
}

# 4. A resource that REFERENCES another — Terraform wires dependencies.
resource "aws_security_group" "app_sg" {
  name = "academy-app-sg"

  # Allow only THIS app's traffic to the database:
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app_ec2_sg.id]
  }
}
```

**Walking through it:**

- The `terraform` block declares the provider versions and the **backend** (where state lives). Remote state (S3 + DynamoDB lock, or Terraform Cloud) is the *team* requirement: without it, two engineers applying different local state files clobber each other.
- The `provider` block configures the platform and its authentication — credentials come from environment variables, IAM roles, or credential files, **never** committed to the repo.
- `resource "aws_db_instance" "academy_db"` — the heart: a declarative description of a database. The `resource` type (`aws_db_instance`), the name (`academy_db` — your label, used for references), and the properties.
- The password references `var.db_password` — a **variable**, not a literal. Terraform's discipline: config in files, secrets in variables/secrets managers.
- The second resource **references the first**: `aws_security_group.app_ec2_sg.id` creates an implicit dependency — Terraform builds a dependency graph and creates the security groups in the right order, no explicit `depends_on` needed.

## The Workflow: init → plan → apply

```bash
# 1. INIT — download providers, set up the backend:
terraform init

# 2. PLAN — compute and SHOW the diff (no changes yet):
terraform plan
#   + aws_db_instance.academy_db will be created
#   + aws_security_group.app_sg will be created

# 3. APPLY — make reality match the plan (with approval):
terraform apply
#   aws_db_instance.academy_db: Creating...
#   Apply complete! Resources: 2 added, 0 changed, 0 destroyed.

# 4. The daily loop — change a file, re-plan, re-apply:
#    (edit main.tf: change instance_class, for example)
terraform plan     # shows: ~ aws_db_instance.academy_db will be updated
terraform apply    # applies the change
```

**The plan is the whole discipline:** Terraform shows you *exactly* what will be created, changed, or destroyed — including the dangerous `-` (destroy) lines — before anything happens. The golden rule of IaC: **review the plan like a code review.** A surprise "will be destroyed" line in a plan is a production incident averted.

## Variables and Outputs: Parameterizing and Surfacing

```hcl
# variables.tf — the tunables:
variable "db_password" {
  description = "Database password — set via TF_VAR_db_password or a secret store"
  type        = string
  sensitive   = true          # never printed in plans/logs
}

variable "environment" {
  type    = string
  default = "dev"
}

# outputs.tf — what to surface after apply (connection strings, IDs):
output "db_endpoint" {
  value = aws_db_instance.academy_db.endpoint
  sensitive = true
}
```

```bash
# Supply values at run time:
terraform apply -var="db_password=$(aws secretsmanager get-secret-value ...)"
# or via environment: TF_VAR_db_password=...
```

**The pattern:** variables parameterize the config (the same `main.tf` builds dev/staging/prod with different `-var` files); outputs surface what the config produced (the DB endpoint your Spring Boot app needs); `sensitive = true` keeps secrets out of the plan output and logs.

## The Terraform State: The Source of Truth (and Its Pitfalls)

State is what lets Terraform know the difference between "create" and "update": it maps each resource declaration to the real object's ID. Three facts to internalize:

1. **State is not optional** — without it Terraform would create duplicates on every apply.
2. **Remote state is mandatory for teams** — the S3 backend (or Terraform Cloud) stores it centrally *and locks it* (DynamoDB) so two applies can't race.
3. **State can drift from reality** — someone edits the cloud console directly, or a resource is deleted out-of-band; `terraform plan` then proposes "fixes" that might be surprises. The remedy: `terraform refresh`/`import` and the discipline that **all changes go through Terraform**.

## Recap

Terraform turns infrastructure into reviewable, versionable code: HCL declarations of cloud resources (providers translate them to each platform's API), a dependency graph wires ordering, and the plan/apply workflow shows the exact diff before any change. The core objects: `provider` (the platform), `resource` (the infrastructure), `variable` (the tunables), `output` (the results), and `state` (the record of reality — remote and locked for teams). The golden rules: **never commit secrets, review every plan like code, and make all changes through Terraform** so state never drifts. This is the "deploy" half of your pipeline made deliberate — and the patterns (plan/apply, variables, state) carry straight into the next lessons on HCL depth and modules.
