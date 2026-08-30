---
title: GraphQL Schema Design — Types, Queries, and Mutations
module: graphql-deep
order: 1
minutes: 26
topics: ["GraphQL schema", "SDL", "types", "queries", "mutations", "schema design"]
summary: GraphQL's defining idea: the client asks for exactly the fields it wants — no overfetching (getting 50 fields when you need 3), no underfetching (n...
docs:
  - title: "GraphQL schema (graphql.org)"
    url: "https://graphql.org/learn/schema/"
---

# GraphQL Schema Design — Types, Queries, and Mutations

## The Concept: The Schema Is the API Contract

GraphQL's defining idea: **the client asks for exactly the fields it wants** — no over-fetching (getting 50 fields when you need 3), no under-fetching (needing 3 requests because no single endpoint has all the data). One endpoint, one query language, and the **schema** is the contract describing everything a client may ask for.

The schema (written in **SDL** — Schema Definition Language) declares:

- **Types** — the shapes of data (`Course`, `Lesson`, `User`).
- **The Query type** — what clients may *read* (the entry points).
- **The Mutation type** — what clients may *change* (the write operations).
- **Field relationships** — how types connect (`Course.lessons: [Lesson!]!`).

Because the schema is explicit, the tooling is powerful: **introspection** lets any client (or tool like GraphiQL/Playground) discover the whole API; type checking happens at query time; and the client request/response shapes are self-validating.

## SDL Essentials

```graphql
# Scalar types: Int, Float, String, Boolean, ID
# List: [Type]     Non-null: Type!
#   - String!   -> a String that is always present
#   - [Lesson!]! -> a list that's present, whose items are always present

type Course {
  id: ID!
  title: String!
  minutes: Int!
  lessons: [Lesson!]!        # relationship: every course has lessons
}

type Lesson {
  id: ID!
  title: String!
  minutes: Int!
  body: String
}

type Query {
  course(id: ID!): Course         # fetch one course, or null
  courses: [Course!]!             # fetch all courses
  searchCourses(keyword: String!): [Course!]!
}

type Mutation {
  createCourse(title: String!, minutes: Int!): Course!
  publishCourse(id: ID!): Course!
}
```

### Reading the SDL

- **`Course`** is an object type: fields with types. `title: String!` — a required String. `lessons: [Lesson!]!` — a non-null list of non-null lessons (a course always has lessons; each lesson is always a full object).
- **`Query`** — the read entry points: every GraphQL API has exactly one `Query` type. `course(id: ID!)` takes a required argument, returns one `Course` (nullable — "not found" returns null).
- **`Mutation`** — the write entry points. By convention, mutations take the inputs they need and return the *changed object* (`createCourse` returns the created `Course` — the client gets back exactly what changed, no separate fetch).

## Nullability — The Design Lever

`!` (non-null) is where schema design gets subtle:

```graphql
type Lesson {
  title: String!        # ALWAYS present — required data
  body: String          # MAY be absent — nullable
  quizUrl: String       # MAY be absent — and might be added later!
}
```

**The rule: non-null only for fields that are truly always there.** Making a field non-null commits the API: adding nullability *later* is a breaking change; removing it isn't. The classic mistake: marking everything non-null for optimism, then having to break clients when a field legitimately becomes optional. **Start nullable, tighten later.**

## The Code Walkthrough — Schema First in Spring

```java
// ---- 1. The schema file (src/main/resources/graphql/schema.graphqls) ----
// type Course { id: ID! title: String! minutes: Int! lessons: [Lesson!]! }
// type Query { course(id: ID!): Course courses: [Course!]! }
// type Mutation { createCourse(title: String!, minutes: Int!): Course! }

// ---- 2. Data fetchers: Spring GraphQL wires schema -> methods ----
import org.springframework.graphql.data.method.annotation.QueryMapping;
import org.springframework.graphql.data.method.annotation.MutationMapping;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.stereotype.Controller;

@Controller
public class CourseGraphqlController {

    private final CourseService service;

    public CourseGraphqlController(CourseService service) { this.service = service; }

    // Implements: course(id: ID!): Course
    @QueryMapping
    public Course course(@Argument Long id) {
        return service.get(id);
    }

    // Implements: courses: [Course!]!
    @QueryMapping
    public List<Course> courses() {
        return service.listAll();
    }

    // Implements: createCourse(title: String!, minutes: Int!): Course!
    @MutationMapping
    public Course createCourse(@Argument String title, @Argument Integer minutes) {
        return service.create(title, minutes);
    }
}
```

### Walking Through Each Part

**The schema file** — Spring GraphQL loads `schema.graphqls` at startup and validates the app against it (a schema that references a non-existent type fails boot). The schema is the contract; the controllers fulfill it.

**`@QueryMapping`** — a method named `course` implements the `course` query from the schema (name matching by default). `@Argument Long id` binds the query's `id` argument. Spring handles field resolution, nullability, and response serialization.

**`@MutationMapping`** — same for writes. Note the mutation *returns the changed object* — the client gets the created course back in one round trip.

## Schema Design Rules of Thumb

1. **Name things for clients, not internals** — `searchCourses`, not `getCoursesByKeywordContaining`.
2. **Input objects for complex mutations** — `createCourse(title: String!, minutes: Int!)` works, but 6-argument mutations become unreadable; define an `input CreateCourseInput` instead.
3. **One field per client need** — the power of GraphQL is that the *client* shapes the response; the schema should offer the data, not pre-shaped endpoints.
4. **Enums over strings** — `enum Status { DRAFT PUBLISHED ARCHIVED }` gives autocomplete + validation.
5. **Versionless evolution** — add fields, don't remove them; nullability discipline lets old clients keep working.

## Common Beginner Pitfalls

1. **Over-fetching design habits** — building "endpoint-shaped" queries when GraphQL wants *field-level* data.
2. **Everything non-null** — breaking change when a field becomes optional; start nullable.
3. **No input types** — mutations with 7 scalar arguments are unreadable and unextendable.
4. **Schema/code mismatch** — a schema field with no data fetcher returns null silently (or errors on non-null); keep schema and fetchers in sync (tests help).
5. **Ignoring introspection in production** — introspection is on by default and exposes your whole schema; disable it in prod if that's a concern.
6. **Mutations with side effects that don't return the result** — return the changed object so clients don't need a follow-up query.

## Key Takeaways

- The GraphQL schema is the API contract: types, Query entry points, Mutation entry points.
- SDL: `Type!` = non-null, `[Type]` = list; the schema is self-documenting and introspectable.
- Clients ask for exactly the fields they want — no over/under-fetching.
- Spring GraphQL: `schema.graphqls` + `@QueryMapping`/`@MutationMapping` controllers.
- Nullability discipline: start nullable, tighten later; add fields, don't remove.
- Use enums and input types; return changed objects from mutations.
