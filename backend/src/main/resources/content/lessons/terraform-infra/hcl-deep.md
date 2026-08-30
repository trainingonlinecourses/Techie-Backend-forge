---
title: HCL Deep — Expressions, Functions, and the Language
module: terraform-infra
order: 2
minutes: 24
topics: ["HCL", "expressions", "functions", "loops", "conditionals", "locals"]
docs:
  - title: "Configuration Language (Terraform docs)"
    url: "https://developer.hashicorp.com/terraform/language"
  - title: "Functions (Terraform docs)"
    url: "https://developer.hashicorp.com/terraform/language/functions"
summary: The first lesson's config was declarative but flat. HCL (HashiCorp Configuration Language) is a full expression language: loops, conditionals, func...
---

# HCL Deep — Expressions, Functions, and the Language

## The Concept: The Config Language Has Real Power

The first lesson's config was declarative but flat. **HCL** (HashiCorp Configuration Language) is a full expression language: loops, conditionals, functions, and interpolation that let a small config generate a *lot* of infrastructure. The power-to-abstraction trade-off is the same as in any language — the skill is using HCL's constructs to avoid repeating yourself without hiding what the config does.

**The mental model:** the resource blocks are the nouns; HCL expressions are the verbs and adjectives. `count` and `for_each` are the loops — "make 3 of these". `locals` are the intermediate variables — "compute this once, use it everywhere". Functions (`join`, `file`, `lookup`) are the standard library. A config that uses them reads like a program — a program whose output is infrastructure.

## Interpolation and Expressions

```hcl
# The bread and butter: reference resources, variables, and compose values.
resource "aws_instance" "app" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = var.instance_type          # variable reference

  tags = {
    Name        = "${var.environment}-app-server"   # interpolation
    Environment = var.environment
    # Expressions compute values:
    CreatedBy   = "${var.owner != "" ? var.owner : "platform"}"  # conditional
  }

  # Referencing OTHER resources wires the dependency graph:
  vpc_security_group_ids = [aws_security_group.app_sg.id]
}
```

**The three expression forms:** direct references (`var.instance_type`, `aws_security_group.app_sg.id`), **string interpolation** (`"${var.environment}-app-server"`), and **operators** — conditionals (`cond ? a : b`), arithmetic, and comparisons. HCL is *typed* (string, number, bool, list, map, object) and validates types at plan time — a `number` where a `string` is expected is an error before anything touches the cloud.

## locals: The Config's Variables

`locals` are named values computed once and used throughout — the anti-repetition tool:

```hcl
locals {
  environment = var.environment                     # short alias
  name_prefix = "academy-${local.environment}"      # composed once
  common_tags = {
    Environment = local.environment
    Project     = "academy"
    ManagedBy   = "terraform"
  }
}

resource "aws_instance" "app" {
  tags = local.common_tags                          # reuse everywhere
}
resource "aws_db_instance" "db" {
  tags = local.common_tags
}
```

**The rule:** if the same value appears in three resources, it belongs in a `local`. Configs with consistent `locals` at the top are readable top-down; configs that repeat literals are maintenance traps (change the environment name in seven places, miss one, get a surprise).

## count vs for_each: The Two Loops

**`count`** creates N *identical-ish* instances, addressed by index:

```hcl
# Three app servers (indexed: aws_instance.app[0], [1], [2]):
resource "aws_instance" "app" {
  count         = var.app_count                 # e.g., 3
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"
  tags = { Name = "${local.name_prefix}-app-${count.index}" }
}
```

**`for_each`** iterates over a map or set, addressed by key — the flexible loop, and the one to prefer when elements differ:

```hcl
# One security-group rule per service, defined in a variable map:
variable "service_ports" {
  type = map(object({
    port    = number
    cidr    = string
  }))
  default = {
    payments = { port = 8080, cidr = "10.0.0.0/8" }
    admin    = { port = 8443, cidr = "10.1.0.0/8" }
  }
}

resource "aws_security_group_rule" "service" {
  for_each = var.service_ports
  type              = "ingress"
  from_port         = each.value.port          # each.key / each.value
  to_port           = each.value.port
  cidr_blocks       = [each.value.cidr]
  security_group_id = aws_security_group.app_sg.id
}
```

**The crucial difference:** `count` uses *position* (`[0]`, `[1]`, `[2]`) — removing an element from the middle of a list shifts the rest, and Terraform may destroy/recreate unrelated instances. `for_each` uses *keys* — removing one element touches only that element. **The professional rule: prefer `for_each` for anything keyed by identity; reserve `count` for genuinely homogeneous, positional sets.**

## Functions: The Standard Library

```hcl
locals {
  # Strings:
  upper_name       = upper(var.app_name)                    # "ACADEMY"
  joined_arns      = join(",", aws_instance.app[*].arn)     # comma-join a list

  # Collections:
  subnets          = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  first_subnet     = element(local.subnets, 0)              # "10.0.1.0/24"
  all_but_first    = slice(local.subnets, 1, 3)
  merged_tags      = merge(local.common_tags, { Extra = "value" })
  defaulted        = lookup(var.settings, "missing", "fallback")  # safe map read

  # Files and data:
  user_data_script = file("${path.module}/scripts/init.sh") # read a file
  checksum         = sha256(local.user_data_script)
}
```

**The ones you'll actually use daily:** `join`/`split` (strings), `file` (read scripts/config into resources — the standard way to pass a bootstrap script to an EC2 instance or a `kubeconfig` to a provider), `lookup` (safe map access with a default), `merge` (compose tag maps), `element`/`slice` (list access), and `length`/`keys`/`values`. The full function list is large but each is a small, documented utility — the skill is recognizing "this repetition is a `for_each`" and "this value is a `lookup`".

## for Expressions and Splat

Two compact syntaxes worth knowing:

```hcl
locals {
  # for expression — transform a collection:
  names_upper = [for n in var.names : upper(n)]         # list -> list

  # ...with a filter:
  long_names  = [for n in var.names : upper(n) if length(n) > 5]

  # Splat — the shortcut for "collect this attribute from all":
  # instead of: [for i in aws_instance.app : i.id]
  all_app_ids = aws_instance.app[*].id
}
```

The **splat** (`[*]`) is the everyday gem: `aws_instance.app[*].id` collects the `id` attribute from every instance in the count/for_each — one token where a loop would take four lines.

## The Abstraction Discipline

HCL's power comes with a warning that every Terraform team learns: **abstraction can hide the plan.** A config with heavy `for_each` and function chains produces plans that are harder to read line-by-line. The balancing rules:

1. Use `locals` and loops to *remove repetition*, not to *hide resources* — the plan should still clearly show what changes.
2. Name things for the plan reader: `aws_instance.app` and `aws_security_group_rule.service` read better than cryptic labels.
3. When a resource group gets complex, extract it into a **module** (the next lesson) — the abstraction boundary that *contains* complexity instead of scattering it.

## Recap

HCL is a real expression language: interpolation and operators compose values; `locals` compute once and reuse (the anti-repetition tool); `count` (positional) and `for_each` (keyed — preferred) generate many resources; functions (`join`, `file`, `lookup`, `merge`, `sha256`) form the standard library; and `for` expressions plus splat syntax (`[*]`) transform collections compactly. The craft is using the power to remove duplication while keeping plans readable — variables and locals for tunables, `for_each` for keyed repetition, and modules (next) as the boundary where complexity lives.
