---
title: Injection Prevention — SQL, NoSQL, and Command Injection
module: owasp-security
order: 2
minutes: 27
topics: ["SQL injection", "parameterized queries", "prepared statements", "NoSQL injection", "command injection", "OWASP"]
docs:
  - title: "SQL Injection Prevention Cheat Sheet (OWASP)"
    url: "https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html"
  - title: "Injection (OWASP Top 10)"
    url: "https://owasp.org/Top10/A03_2021-Injection/"
---

# Injection Prevention — SQL, NoSQL, and Command Injection

## The Concept: Untrusted Input That Becomes Code

**Injection** happens when untrusted input (from a form, a URL, an API body) is combined with an *interpreter* — SQL, NoSQL query, OS command, LDAP — in a way that lets the input *change the meaning* of the instruction. The attacker isn't just providing data; they're providing *code* that the interpreter executes. It's the third most critical web risk, and it's almost always a *developer error* — a missing parameterization — rather than an exotic attack.

**The mental model:** SQL is a sentence with a grammar. Your code builds the sentence by *gluing strings*; the attacker's input contains *punctuation and keywords* that hijack the grammar. `' OR '1'='1` isn't a name — it's a *clause* that makes the WHERE always true. Parameterization is the fix because it changes the grammar: the `?` placeholder reserves a slot where the input can only ever be a *value* — punctuation in the value stays punctuation in the value, never becoming grammar. The sentence is fixed; only the words change.

## The Vulnerability, Made Concrete

```java
// The attacker-controlled input arrives from a request:
String name = request.getParameter("name");

// VULNERABLE — the input is GLUED into the query:
String sql = "SELECT * FROM users WHERE name = '" + name + "'";
jdbcTemplate.query(sql, ...);
//   name = "admin' --"        -> WHERE name = 'admin' --'   (comment hides the rest)
//   name = "' OR '1'='1"      -> WHERE name = '' OR '1'='1' (returns EVERY row)
//   name = "'; DROP TABLE users; --"  -> the classic destruction
```

Each payload works because the input is *interpreted as SQL grammar*. The quotes in the input close the string literal the developer opened; the attacker's keywords then write new clauses. The damage scales from data theft (return every row) to data destruction.

## The Fix: Parameterization, Always

```java
// SAFE — parameterized query. The ? is a slot for a VALUE, not grammar.
jdbcTemplate.query(
    "SELECT * FROM users WHERE name = ?",
    (rs, i) -> new User(rs.getString("id"), rs.getString("name")),
    name);                                    // <- the value, bound separately

// With named parameters (Spring's NamedParameterJdbcTemplate):
namedJdbc.query(
    "SELECT * FROM users WHERE name = :name",
    Map.of("name", name),
    (rs, i) -> new User(rs.getString("id"), rs.getString("name")));
```

**What happens under the hood:** the SQL string with `?` is *compiled* (parsed) once, and the parameters are sent separately. The database knows the structure is `WHERE name = <value>`; the input can only fill the value slot. `admin' --` becomes the literal *string* `admin' --` — it's stored/compared as data, never parsed as grammar. **This is the single most important rule in web security: never build SQL by string concatenation; always bind parameters.**

The same rule extends through the stack:

- **JPA/Hibernate:** use named parameters (`:name`) or positional (`?1`) in `@Query` — never concatenate. JPQL is parameterizable the same way as SQL.
- **Criteria API:** the `CriteriaBuilder` builds queries with typed parameters — inherently safe.
- **MyBatis:** `#{name}` binds (safe); `${name}` concatenates (unsafe — only for identifiers you control).

## The Dynamic-Table/Column Trap

Parameterization binds *values* — it cannot bind *identifiers* (table/column names), because identifiers are grammar by nature. Dynamic ordering and dynamic columns are where injection sneaks back in:

```java
// VULNERABLE — the sort column is grammar, not a value:
String sql = "SELECT * FROM products ORDER BY " + sortColumn;
//   sortColumn = "price; DROP TABLE products; --"  -> injection!

// SAFE — NEVER bind identifiers; whitelist them instead:
List<String> ALLOWED = List.of("price", "name", "created_at");
if (!ALLOWED.contains(sortColumn)) sortColumn = "price";   // deny by default
```

**The rule:** identifiers come from a *whitelist you control*, never from user input directly. The same applies to dynamic table names, dynamic `GROUP BY` columns, and dynamic SQL fragments — each is a grammar slot that parameterization can't protect.

## NoSQL Injection: The Same Idea, Different Syntax

MongoDB queries are JSON documents — and building them by concatenation is equally vulnerable:

```js
// VULNERABLE — string-built query document:
// const q = `{ "username": "${username}", "password": "${password}" }`;
//   username = `"admin", "password": { "$ne": "" }`  -> bypasses auth entirely!
//   $ne ("not equal") makes the password check always true.

// SAFE — build the query with operators, never strings (Spring Data):
Criteria.where("username").is(username).and("password").is(password);
```

The mechanism is identical: user input that becomes *query operators* (`$ne`, `$gt`, `$where`) instead of values. Spring Data's `Criteria` builder, like prepared statements, keeps input in the value slot.

## Command Injection: The OS as Interpreter

```java
// VULNERABLE — user input becomes an OS command:
String file = request.getParameter("file");
Process p = Runtime.getRuntime().exec("cat " + file);
//   file = "/etc/passwd; rm -rf /home"  -> the semicolon chains commands!

// SAFE — never build OS commands from input:
//   - Use the Java API instead of the shell (Files.readString, etc.)
//   - If a process is truly needed, pass arguments as a LIST (no shell):
//     new ProcessBuilder("cat", file)  // args are passed, never parsed by a shell
//   - Validate/whitelist the input (a path inside a known directory)
```

The principle generalizes: **any interpreter that receives untrusted input — SQL, query documents, OS shells, LDAP filters, even HTML — must receive it as *data* (bound, escaped, or validated), never as *code*.** The OWASP cheat sheets document the per-interpreter safe construction for each.

## The Defense-in-Depth Layers

Parameterization is the primary defense; real systems layer more:

1. **Parameterized queries** — the fix itself (primary).
2. **Input validation** — reject/coerce at the boundary: types, lengths, allowed-character sets (`@Valid`, `@Pattern`). Validation alone is *not sufficient* (encodings and edge cases evade it), but it shrinks the attack surface.
3. **Least privilege** — the DB user the app connects with should not have `DROP TABLE` rights. Injection damage is capped by the account's privileges.
4. **Output encoding** — if data must be re-rendered, encode per context (HTML, URL, JSON) so stored payloads can't become HTML/JS (the XSS link).
5. **Web Application Firewall (WAF)** — a detection layer, never a substitute for parameterization.
6. **Scanning** — SAST in CI flags string-built SQL; DAST (OWASP ZAP) tests the running app.

## The Habit Checklist

- SQL/JPQL: **always `?` / `:name` / `?1`** — never `+` concatenation.
- Dynamic identifiers: **whitelist**, never direct input.
- NoSQL: build with criteria/operators, not string documents.
- OS commands: use the Java API or `ProcessBuilder` argument lists; avoid the shell.
- Validate input at the boundary; run least-privilege DB accounts; scan in CI.

## Recap

Injection is untrusted input that becomes interpreter grammar — SQL, NoSQL, or OS — and it's caused by string-building instructions instead of binding values. The fix is **parameterization**: prepared statements and named parameters put input in the value slot where it can never alter the sentence, `?`-style, in every layer (JdbcTemplate, JPA, Criteria). Identifiers (table/column names) can't be parameterized — whitelist them. NoSQL and command injection are the same idea in different syntaxes, with the same cure: build with operators/APIs, never strings/shells. Defense in depth — validation, least privilege, encoding, scanning — layers on top, but parameterization is the load-bearing wall: get it right once, and an entire category of catastrophe is closed.
