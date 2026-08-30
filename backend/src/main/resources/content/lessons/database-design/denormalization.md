---
title: Denormalization — The Deliberate Trade-Off
module: database-design
order: 5
minutes: 25
topics: ["denormalization", "read models", "materialized views", "redundancy", "performance trade-offs"]
docs:
  - title: "Denormalization (Wikipedia)"
    url: "https://en.wikipedia.org/wiki/Denormalization"
summary: Normalization says "store each fact once." Denormalization says "sometimes storing a fact twice — deliberately, with a synchronization strategy — i...
---

# Denormalization — The Deliberate Trade-Off

## The Concept: When Storing the Same Fact Twice Is the Right Call

Normalization says "store each fact once." **Denormalization** says "sometimes storing a fact twice — deliberately, with a synchronization strategy — is the right engineering call." The tension:

- **Normalized** → no redundancy, no inconsistency, but **joins** on every read.
- **Denormalized** → fast reads (data already assembled), but **redundancy** you must keep consistent.

The deciding factor is the **read/write ratio**. A read-heavy system (dashboards, feeds, reporting) can pay a write-time cost to assemble data once, then serve reads with zero joins. A write-heavy transactional system (orders, ledgers) should stay normalized — consistency wins.

Think of it like a menu vs a recipe book: the menu (denormalized) shows each dish with price and description ready to read instantly. The recipe book (normalized) stores each ingredient once. Restaurants need both — the menu is derived from the recipes, and updated when the recipes change.

## The Canonical Examples

### 1. The summary column on a parent

```sql
-- Normalized: total requires a join+aggregate on every read
SELECT SUM(ol.quantity * p.price) FROM order_lines ol JOIN products p ...;

-- Denormalized: the order row carries its total
ALTER TABLE orders ADD COLUMN total NUMERIC(10,2) NOT NULL DEFAULT 0;
```

Every order read is now a single-row lookup. The cost: whenever lines change, the total must be recomputed. The synchronization is the contract.

### 2. The read model (projection)

The most disciplined form of denormalization: a **read model** — a separate table shaped exactly for a screen's queries:

```sql
-- The dashboard read model: pre-joined, pre-aggregated
CREATE TABLE dashboard_course_stats (
    course_id BIGINT PRIMARY KEY,
    title TEXT,
    lesson_count INT,
    total_minutes INT,
    completion_rate NUMERIC(5,2),
    last_updated TIMESTAMPTZ
);
```

The app's hot dashboard query is a single `SELECT * FROM dashboard_course_stats` — no joins, no aggregates. A background job (or DB trigger, or event listener) rebuilds it when the source data changes.

### 3. Materialized views (the database does the sync)

```sql
-- Postgres materialized view: the DB maintains the denormalized result
CREATE MATERIALIZED VIEW course_stats AS
SELECT c.id AS course_id,
       c.title,
       COUNT(l.id) AS lesson_count,
       COALESCE(SUM(l.minutes), 0) AS total_minutes
FROM courses c
LEFT JOIN lessons l ON l.course_id = c.id
GROUP BY c.id, c.title;

-- Refresh it (on schedule or on demand):
REFRESH MATERIALIZED VIEW course_stats;
```

The DB itself stores the pre-computed result. Reads hit the materialized view; the view is refreshed on your schedule. No application code maintains consistency — the database does.

## The Code Walkthrough — The Synchronization Contract

The core engineering challenge: **keeping the redundant copy consistent.** Three strategies, in increasing sophistication:

```java
// ---- Strategy 1: update in the same transaction (strongest consistency) ----
@Service
public class OrderService {

    @Transactional
    public Order addLine(long orderId, Product p, int qty) {
        Order order = repo.findById(orderId).orElseThrow();
        order.addLine(p, qty);

        // The denormalized total is updated IN THE SAME TRANSACTION:
        order.setTotal(order.computeTotal());    // recompute + save together
        return repo.save(order);                 // line change + total change are atomic
    }
}

// ---- Strategy 2: async projection (eventual consistency, faster writes) ----
// On OrderLineChanged event:
@EventListener
public void onOrderChanged(OrderLineChanged event) {
    Order order = repo.findById(event.orderId()).orElseThrow();
    order.setTotal(order.computeTotal());
    repo.save(order);           // may lag a few ms behind the line change
}

// ---- Strategy 3: DB-maintained (materialized view / trigger) ----
// REFRESH MATERIALIZED VIEW order_totals;  (scheduled or on-change)
```

### Walking Through Each Part

**Same-transaction updates** — the strongest form: the line change and the total recompute commit together. Readers never see an inconsistent total. The cost: the write path does more work (recompute + save), and it couples the write to the maintenance.

**Event-driven projections** — the write path stays fast (fire the event, return); a listener updates the read model asynchronously. The trade-off: a brief window where the read model lags the source — **eventual consistency**. Dashboards and feeds tolerate milliseconds of lag; ledgers don't.

**Materialized views** — the database owns the sync entirely. No app code can forget to maintain it. The costs: refresh is all-or-nothing (a huge view refreshes slowly), and the view is stale between refreshes (acceptable for reporting).

## The Decision Framework

| Situation | Lean |
|---|---|
| Transactional writes, consistency critical | Normalized (source of truth) |
| Read-heavy screens with hot queries | Denormalized read model |
| Reporting/analytics | Materialized views |
| Can't tolerate any staleness | Same-transaction maintenance |
| Staleness fine (dashboards, feeds) | Event-driven or scheduled refresh |

The master rule: **keep a normalized source of truth; denormalize only the read path; make the synchronization explicit and monitored.** When the sync breaks silently, the denormalized data becomes a lie — so monitor staleness (e.g., `last_updated` vs source max timestamp).

## The Failure Modes

1. **Silent drift** — a maintenance path that forgot to fire; the read model is stale and nobody notices. Monitor it.
2. **Double-writes that aren't atomic** — updating the source but failing to update the copy (or vice versa). Same transaction or compensating logic.
3. **Denormalizing the source of truth** — applying read-model thinking to the transactional core corrupts it. Keep the normalized core.
4. **Over-denormalization** — every screen gets its own table, and the sync matrix explodes. Consolidate read models by domain.

## Common Beginner Pitfalls

1. **Denormalizing for performance without measuring** — the join wasn't slow; the missing index was. Optimize the query first (indexes, projections), denormalize second.
2. **No sync strategy** — copying data into a column with no plan to maintain it; the redundancy rots.
3. **Atomicity forgotten** — source and copy updated in separate transactions; a crash between them = inconsistency.
4. **Unmonitored staleness** — the read model lags and nobody knows; alert on age.
5. **Treating materialized views as free** — large views refresh slowly and block; schedule and monitor the refresh.
6. **Denormalizing "just in case"** — add the read model when the query is actually hot, not preemptively.

## Key Takeaways

- Denormalization = storing a fact more than once, deliberately, for read performance.
- Read/write ratio decides: read-heavy → denormalize the read path; write-heavy → stay normalized.
- The read model (projection table) and materialized views are the disciplined forms.
- Synchronization is the contract: same-transaction (strong), event-driven (eventual), or DB-maintained (materialized).
- Keep a normalized source of truth; denormalize only the read path.
- Measure before denormalizing; monitor staleness after.
