---
title: ER Modeling — From Requirements to Tables
module: database-design
order: 4
minutes: 25
topics: ["ER diagrams", "entities", "attributes", "cardinality", "schema design process"]
docs:
  - title: "Entity–relationship model (Wikipedia)"
    url: "https://en.wikipedia.org/wiki/Entity%E2%80%93relationship_model"
---

# ER Modeling — From Requirements to Tables

## The Concept: Drawing the Database Before Writing It

An **entity-relationship (ER) model** is a diagram of your domain before it becomes SQL: the **entities** (things that exist: Student, Course, Lesson), their **attributes** (properties: name, email, duration), and the **relationships** between them (a Student *enrolls in* many Courses).

Why model first? The diagram forces you to answer the hard questions *cheaply* — before schema exists:

- What are the real *things* in this domain (vs mere properties)?
- What are the *cardinalities* — how many of one relate to how many of another?
- Where does each attribute belong? (A student's email on the student; a course's duration on the course.)

A 30-minute diagram session catches the modeling errors that a 3-month build would otherwise discover in production. The diagram is the blueprint; the SQL is the construction.

## The Notation (Chen / Crow's Foot)

The essentials:

- **Entity** — a rectangle: `STUDENT`, `COURSE`.
- **Attribute** — an ellipse attached to its entity: `STUDENT (name, email, id)`.
- **Relationship** — a diamond connecting entities: `ENROLLS_IN`.
- **Cardinality** — the "how many": one-to-one, one-to-many, many-to-many.

Crow's foot notation marks the "many" side with a crow's foot (three prongs):

```
STUDENT  |<---------o<  ENROLLS_IN  >o---------|  COURSE
         (one)        (many)   (many)         (one)
```

A student can be in many enrollments; a course can be in many enrollments — many-to-many through the `ENROLLS_IN` relationship.

## The Modeling Process

1. **List the nouns** — from the requirements, underline the *things* (entities) vs the *properties* (attributes). "A student takes courses with lessons" → Student, Course, Lesson.

2. **Decide attributes** — each entity's properties. Ask: *does this belong to one thing, or describe a relationship?* ("enrolled date" belongs to the enrollment, not the student.)

3. **Draw relationships + cardinality** — connect the entities, mark one/many. This is where most design errors surface.

4. **Resolve many-to-many** — every M:N relationship becomes a join table (previous lesson).

5. **Derive the schema** — entities become tables, attributes become columns, relationships become FKs.

## The Code Walkthrough — A Full Example

**Requirements:** "A student can enroll in many courses. Each course has many lessons. Each lesson belongs to one course. A student can mark lessons complete. Courses have one instructor; instructors teach many courses."

**Step 1 — entities:** `STUDENT`, `COURSE`, `LESSON`, `INSTRUCTOR`. (Note: "enrollment" and "completion" are *relationships with attributes* — they'll become tables later.)

**Step 2 — attributes:**

```
STUDENT(id, name, email)
COURSE(id, title, minutes)
LESSON(id, title, body)
INSTRUCTOR(id, name)
ENROLLS_IN(enrolled_at)     <- relationship attribute
COMPLETES(completed_at)     <- relationship attribute
```

**Step 3 — relationships & cardinality:**

```
STUDENT  M — ENROLLS_IN — N  COURSE      (many-to-many)
COURSE   1 — HAS — N         LESSON       (one-to-many)
INSTRUCTOR 1 — TEACHES — N   COURSE       (one-to-many)
STUDENT  M — COMPLETES — N   LESSON       (many-to-many)
```

**Step 4 — the resulting schema:**

```sql
CREATE TABLE students (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);

CREATE TABLE instructors (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE courses (
    id BIGSERIAL PRIMARY KEY,
    instructor_id BIGINT NOT NULL REFERENCES instructors(id),
    title TEXT NOT NULL,
    minutes INT NOT NULL CHECK (minutes > 0)
);

CREATE TABLE lessons (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL
);

-- M:N resolved into join tables, carrying their relationship attributes:
CREATE TABLE enrollments (
    student_id BIGINT NOT NULL REFERENCES students(id),
    course_id  BIGINT NOT NULL REFERENCES courses(id),
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, course_id)
);

CREATE TABLE completions (
    student_id BIGINT NOT NULL REFERENCES students(id),
    lesson_id  BIGINT NOT NULL REFERENCES lessons(id),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, lesson_id)
);
```

### Walking Through Each Part

**Entities → tables** — every rectangle becomes a table; attributes become columns.

**One-to-many → FK** — `courses.instructor_id REFERENCES instructors(id)`: the "many" side (a course has one instructor) holds the FK.

**Many-to-many → join tables** — `enrollments` and `completions` carry the *relationship attributes* (`enrolled_at`, `completed_at`) plus the composite PK preventing duplicates. This is why "enrollment date" never ends up on the student row — it describes the *relationship*, not the student.

**The CHECK** — `minutes > 0` is a rule the diagram doesn't capture but the schema must: constraints are where modeling meets enforcement (previous lesson).

## The Verification Questions

Before writing any SQL, sanity-check the model:

1. **Can I answer every requirement query from this model?** ("Which lessons has student X completed?" → `completions` join `lessons`.)
2. **Is every attribute on the right entity?** (duration on course, not lesson; enrolled date on the relationship.)
3. **Is every cardinality right?** (the diagram's M/N markings match the FKs.)
4. **Does every join table have its composite PK?** (no duplicate pairs.)
5. **Is 3NF respected?** (no fact stored twice — previous lesson.)

## Common Beginner Pitfalls

1. **Attributes on the wrong entity** — putting `course_title` on the enrollment row repeats data (normalization violation) and breaks when the title changes.
2. **Missing relationship attributes** — "enrolled_at" has nowhere to live because the join table wasn't planned.
3. **Cardinality mistakes** — modeling a one-to-many as many-to-many (or vice versa) propagates into wrong FKs.
4. **Skipping the model** — "I'll just write the tables" — the diagram is where errors are cheap; the schema is where they're expensive.
5. **Entities that are really attributes** — "PhoneNumber" as an entity when it's a column; keep entities to *things*.
6. **Forgetting the query side** — a model that stores data well but can't answer the app's queries efficiently needs rework; design with the queries in mind.

## Key Takeaways

- ER modeling: entities (rectangles), attributes (ellipses), relationships (diamonds), cardinality (crow's feet).
- The diagram forces the hard questions cheaply, before schema exists.
- Entities → tables; attributes → columns; relationships → FKs.
- Many-to-many becomes a join table carrying relationship attributes.
- Verify the model against the requirement queries before writing SQL.
- The blueprint phase is where design errors cost nothing — use it.
