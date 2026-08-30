---
title: Constraints — The Database Refuses Bad Data
module: database-design
order: 3
minutes: 24
topics: ["NOT NULL", "UNIQUE", "CHECK", "FOREIGN KEY", "constraint design", "data integrity"]
docs:
  - title: "PostgreSQL constraints"
    url: "https://www.postgresql.org/docs/current/ddl-constraints.html"
summary: Application validation is the first line of defense — but it's not enough. Every app has bugs, every API has a path you forgot to validate, every f...
---

# Constraints — The Database Refuses Bad Data

## The Concept: The Last Line of Defense Is the Schema

Application validation is the *first* line of defense — but it's not enough. Every app has bugs, every API has a path you forgot to validate, every future consumer of the database (another service, a data migration, a manual fix) bypasses your code entirely. **Constraints** are the *database's own* rules: the database refuses to store data that violates them, no matter who or what tries.

Think of a building's safety systems: fire alarms (app validation) warn people; but the *structural* rules — load limits, exit requirements, materials (constraints) — are enforced by the building code itself. You can't waive them by forgetting to check.

Constraint failures surface as errors (`CHECK constraint violated`, `duplicate key violates unique constraint`) — which is *good*: bad data is stopped at the door with a clear signal, instead of corrupting the database silently.

## The Constraint Toolkit

| Constraint | What it guarantees | Analogy |
|---|---|---|
| `NOT NULL` | The column always has a value | Every form field is mandatory |
| `UNIQUE` | No two rows share this value | No two citizens share a passport number |
| `PRIMARY KEY` | Unique + not null (the row's identity) | The address — one per house, always present |
| `CHECK` | A boolean rule holds for every row | "Age must be ≥ 0" |
| `FOREIGN KEY` | Values exist in the referenced table | The manifest references real addresses |
| `EXCLUDE` (Postgres) | No overlapping rows (e.g., time ranges) | No two bookings overlap a room |

## The Code Walkthrough

```sql
CREATE TABLE enrollments (
    id BIGSERIAL PRIMARY KEY,
    student_id BIGINT NOT NULL REFERENCES students(id),
    course_id BIGINT NOT NULL REFERENCES courses(id),
    grade NUMERIC(3,2),

    -- 1. CHECK: a rule about the data itself
    CONSTRAINT grade_range CHECK (grade IS NULL OR (grade >= 0 AND grade <= 4.00)),
    CONSTRAINT not_self_enroll CHECK (student_id <> course_id),  -- silly but illustrative

    -- 2. UNIQUE: no duplicate enrollments
    CONSTRAINT one_enrollment_per_pair UNIQUE (student_id, course_id),

    -- 3. Composite CHECK with multiple columns
    CONSTRAINT consistent_dates CHECK (enrolled_at <= withdrawn_at)
);

-- 4. Named constraints fail with clear messages
-- INSERT INTO enrollments (student_id, course_id, grade) VALUES (1, 1, 5.5);
-- ERROR:  new row for relation "enrollments" violates check constraint "grade_range"
```

### Walking Through Each Part

**`NOT NULL`** — the column must always have a value. `grade` is nullable (a student may not have a grade yet) but `student_id`/`course_id` never are. Choose per column: *is "unknown" a meaningful state?* If yes, nullable; otherwise `NOT NULL`.

**`CHECK (grade >= 0 AND grade <= 4.00)`** — a boolean rule validated on every insert/update. Note the `grade IS NULL OR ...` — NULLs are allowed to pass, so the check applies only to real grades. **CHECK is where business rules live at the schema level**: positive quantities, valid percentages, sane date ranges.

**`UNIQUE (student_id, course_id)`** — composite uniqueness: the *pair* can't repeat. This is the schema-level guarantee "no double enrollments" — no application bug can create a duplicate.

**Named constraints** — giving constraints names (`grade_range`) means error messages name the rule. Unnamed constraints produce cryptic generated names (`enrollments_check`); naming makes errors actionable: *which* rule did the insert violate?

## Constraints vs Application Validation — The Division of Labor

| Layer | Catches | Guarantees |
|---|---|---|
| DTO validation (`@Valid`) | User-facing errors with friendly messages | UX: 400 with field messages |
| Service logic | Business-flow rules (state machines, preconditions) | Correct orchestration |
| **Database constraints** | **Everything that slips through** — race conditions, bad migrations, direct SQL, other services | **Data integrity, always** |

The key insight: **constraints are not a replacement for validation — they're the backstop.** Validate early for good UX; constrain in the DB so bad data *cannot exist*, no matter the entry path. A race between two concurrent inserts that both pass app-level checks is caught by the `UNIQUE` constraint; a negative quantity from a misbehaving batch job is caught by `CHECK`.

## Constraint Design Rules

1. **Name everything** — `CONSTRAINT meaningful_name ...` for every constraint you care about.
2. **CHECK before trusting input from anywhere** — any column whose range is knowable (`quantity > 0`, `status IN ('a','b','c')`) deserves a CHECK.
3. **UNIQUE for business identity** — emails, slugs, enrollment pairs — uniqueness the app *depends on* must be in the schema.
4. **FOREIGN KEY everywhere a reference exists** — every `_id` column that points at another table gets a `REFERENCES` (and an `ON DELETE` decision).
5. **Enums as CHECK or a lookup table** — `status TEXT CHECK (status IN ('PENDING','PAID','CANCELLED'))` is simple; a lookup table is extensible. For stable small sets, CHECK is fine.

## The Migration Angle

Adding a constraint to a table with existing data: the DB validates all rows at migration time. If old data violates the new rule, the migration fails — which is *exactly* what you want (it surfaces the corruption rather than enshrining it):

```sql
ALTER TABLE enrollments
    ADD CONSTRAINT grade_range CHECK (grade IS NULL OR (grade >= 0 AND grade <= 4.00));
-- ERROR: check constraint is violated by some row  <- tells you cleanup is needed first
```

## Common Beginner Pitfalls

1. **No constraints "to keep it flexible"** — flexibility means garbage. The DB is the integrity boundary.
2. **CHECK with NULL surprises** — a CHECK that doesn't handle NULL passes NULLs (they're not false — they're unknown). Write `col IS NULL OR ...` where NULL is allowed.
3. **Unnamed constraints** — cryptic error messages; name everything.
4. **Relying on app validation alone** — race conditions and direct DB access bypass it; constraints close the door.
5. **Over-constraining** — a CHECK that forbids legitimate future states (e.g., hardcoding a list that will grow) becomes a migration burden; match the rule to the *invariant*, not the current data.
6. **`NOT NULL` on everything** — "unknown" is sometimes meaningful; nullability is a modeling decision.

## Key Takeaways

- Constraints are the database's own refusal to store bad data — the backstop behind app validation.
- `NOT NULL`, `UNIQUE`, `CHECK`, `FOREIGN KEY` cover the essential integrity rules.
- Business rules belong in CHECKs: ranges, positivity, allowed values.
- Composite `UNIQUE` prevents duplicate pairs at the schema level.
- Name your constraints; handle NULLs in CHECKs; pick `ON DELETE` policies.
- Constraints surface data corruption at migration time instead of hiding it.
