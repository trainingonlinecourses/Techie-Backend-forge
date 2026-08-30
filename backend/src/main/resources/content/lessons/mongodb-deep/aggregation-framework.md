---
title: The Aggregation Framework — Pipelines, Grouping, and Joins
module: mongodb-deep
order: 4
minutes: 26
topics: ["aggregation", "pipelines", "group", "unwind", "lookup", "project"]
docs:
  - title: "Aggregation Pipeline (MongoDB Manual)"
    url: "https://www.mongodb.com/docs/manual/core/aggregation-pipeline/"
  - title: "Aggregation Stages (MongoDB Manual)"
    url: "https://www.mongodb.com/docs/manual/reference/operator/aggregation-pipeline/"
summary: MongoDB's find handles simple queries, but real reporting needs aggregation: grouping, summing, averaging, counting, joining collections, reshaping...
---

# The Aggregation Framework — Pipelines, Grouping, and Joins

## The Concept: SQL's GROUP BY, as a Pipe

MongoDB's `find` handles simple queries, but real reporting needs **aggregation**: grouping, summing, averaging, counting, joining collections, reshaping documents. The aggregation framework does this as a **pipeline** — a series of stages, each transforming the stream of documents and passing the result to the next. It's the document-model equivalent of `SELECT ... GROUP BY ... HAVING ... ORDER BY` — plus operations SQL can't express easily (unwinding arrays, joining across collections).

**The mental model:** a factory assembly line. Documents enter the line, each **stage** does one job (filter, reshape, split, group), and the output of one stage is the input of the next. `$match` filters (like WHERE), `$group` aggregates (like GROUP BY), `$sort` orders (like ORDER BY), `$project` shapes the output (like SELECT), `$unwind` flattens arrays, and `$lookup` joins another collection. Because each stage receives the previous stage's output, complex reports are built by *composing simple steps* — readable, testable, and running entirely server-side.

## A Reporting Pipeline, Stage by Stage

Say we have an `orders` collection with `{customerId, items: [{productId, qty, price}], status, createdAt}` — and we want a report: total revenue by status, this year, sorted.

```js
db.orders.aggregate([
  // STAGE 1 — $match: filter early. Only orders this year.
  { $match: { createdAt: { $gte: ISODate("2025-01-01") } } },

  // STAGE 2 — $unwind: ONE document per array element.
  // "o1" with 3 items becomes 3 documents, each with a single item.
  { $unwind: "$items" },

  // STAGE 3 — $project: compute per-item revenue (shape the stream).
  { $project: { status: 1, revenue: { $multiply: ["$items.qty", "$items.price"] } } },

  // STAGE 4 — $group: group by status, sum the revenue.
  { $group: { _id: "$status", totalRevenue: { $sum: "$revenue" },
              orderCount: { $sum: 1 } } },

  // STAGE 5 — $sort: biggest first.
  { $sort: { totalRevenue: -1 } }
]);
```

**Walking through each stage:**

- **`$match`** — filters documents *first*, which is the performance rule: filter before you transform, so later stages process fewer documents. Always put the most selective `$match` as early as possible — this is the aggregation equivalent of "WHERE before GROUP BY".

- **`$unwind`** — the star of the show: it *flattens arrays*. An order with 3 items becomes 3 documents, each carrying the order plus one item. This is the document-model answer to "I need a row per line item" — it denormalizes the embedded array into a stream.

- **`$project`** — reshapes each document: keep `status`, compute `revenue` per item (`qty × price`), discard the rest. Note the operator expressions (`$multiply`) — aggregation has a whole expression language (`$add`, `$cond`, `$dateToString`, `$toUpper`, ...).

- **`$group`** — the heart of aggregation: `_id` is the grouping key (like GROUP BY); `$sum: "$revenue"` accumulates within each group; `$sum: 1` counts documents. Other accumulators: `$avg`, `$min`, `$max`, `$first`, `$last`, `$push` (collect values into arrays).

- **`$sort`** — orders the grouped result, biggest revenue first.

## The Pipeline as a Whole

The result: one document per status — `{_id: "shipped", totalRevenue: 48213.5, orderCount: 312}`. Five simple stages composed into a real report, executed entirely inside MongoDB — no data shipped to the app, no N+1 queries.

## $lookup: The Join You Thought You Couldn't Do

When referencing (not embedding) is right, `$lookup` joins across collections — the document-model LEFT OUTER JOIN:

```js
db.orders.aggregate([
  { $match: { customerId: "c1" } },
  { $lookup: {
      from: "customers",                 // the other collection
      localField: "customerId",          // field in orders
      foreignField: "_id",               // field in customers
      as: "customer"                     // output array field
  } },
  // $lookup produces an ARRAY (even for one match) — unwind to flatten:
  { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
  { $project: { total: 1, "customer.name": 1 } }
]);
```

The result: each order carries its customer's name — a join, server-side. The caveats: `$lookup` doesn't use indexes as freely as a relational join (design indexes on `foreignField`), and heavy joins signal you may have modeled relationally inside a document DB. Use it deliberately for read-time enrichment, not as your default modeling tool.

## The Performance Rules

1. **Filter early.** `$match` first; every stage downstream processes fewer docs.
2. **Index the match fields.** Aggregations are only as fast as their `$match` — create indexes on the fields you filter and group by (`{status: 1, createdAt: -1}`).
3. **Project late, not early — no.** Actually: *shape late*. Only keep the fields each stage needs; `$project` at the end for the final shape.
4. **`$sort` before `$group`** can use an index; `$group` then `$sort` forces a blocking sort.
5. **Limit memory.** Stages like `$group` and `$sort` are memory-hungry; large datasets may need `allowDiskUse: true`.

## Aggregation From Spring Data

Spring Data MongoDB wraps pipelines with `Aggregation` builders:

```java
import org.springframework.data.mongodb.core.aggregation.*;
import org.springframework.data.mongodb.core.MongoTemplate;

@Service
public class ReportingService {
    private final MongoTemplate mongo;

    public List<StatusRevenue> revenueByStatus() {
        Aggregation agg = Aggregation.newAggregation(
                Aggregation.match(Criteria.where("createdAt")
                        .gte(LocalDate.now().withDayOfYear(1).atStartOfDay())),
                Aggregation.unwind("items"),
                Aggregation.project()
                        .andExpression("items.qty * items.price").as("revenue")
                        .and("status").as("status"),
                Aggregation.group("status")
                        .sum("revenue").as("totalRevenue")
                        .count().as("orderCount"),
                Aggregation.sort(Sort.Direction.DESC, "totalRevenue")
        );
        return mongo.aggregate(agg, "orders", StatusRevenue.class).getMappedResults();
    }
}
```

Every stage has a builder method mirroring the shell operator: `match`, `unwind`, `project`, `group`, `sort`, `lookup`. The pipeline you designed in the shell translates nearly 1:1 — same stages, same order, Java syntax. `mongo.aggregate(...)` runs it and maps results into your DTO/record.

## Recap

The aggregation framework is MongoDB's answer to reporting and analytics: a pipeline of stages (`$match` → `$unwind` → `$project` → `$group` → `$sort`), each transforming the document stream. `$match` filters early, `$unwind` flattens arrays into rows, `$project` shapes and computes, `$group` aggregates with accumulators, and `$lookup` joins collections. The performance rules are filter-early, index-your-match, and beware memory-heavy stages. Spring Data MongoDB mirrors every stage with builder methods, so the pipeline you prototype in `mongosh` ports directly into `MongoTemplate` code. Master the pipeline and "can MongoDB do this report?" stops being a question — it becomes a sequence of stages.
