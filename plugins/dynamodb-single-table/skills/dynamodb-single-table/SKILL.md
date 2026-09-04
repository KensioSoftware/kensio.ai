---
name: dynamodb-single-table
description: Model data in Amazon DynamoDB as one table by default, reading the current AWS guidance before committing to a schema, writing the access patterns down before any keys exist, holding every entity type in one table, overloading generic partition and sort keys across those types, overloading and sparsifying secondary indexes, and splitting items by write rate. Use when designing or reviewing a DynamoDB schema, when a CDK stack is about to gain a second table, when an entity needs a query it has no key for, when application code fetches from two tables to assemble one response, when a Scan or a filter expression appears, when a partition runs hot or a write throttles, and when asked how to model users, orders, events or tenants in DynamoDB.
license: Apache-2.0
metadata:
  version: "1.18.1"
---

# Single-table design in DynamoDB

DynamoDB is a key-value store with a query language shaped like an index lookup. Almost all of the
data modelling advice in the training data is about SQL, and carrying it over produces a table per
entity, a join in the application layer, and a `Scan` wherever the keys fall short. That is the
reflex this skill exists to interrupt.

The default is **one table per service**, holding every entity type, with keys derived from the
queries the application makes. AWS puts it plainly in the NoSQL design best practices. "You should
maintain as few tables as possible in a DynamoDB application." A second table needs a reason from
[When a second table earns its place](#when-a-second-table-earns-its-place). "One entity, one table"
is never one of them.

## Read the current guidance before designing a schema

This file is a summary, and a summary goes stale. Quotas change, the worked examples carry detail no
summary keeps, and a schema outlives the session that produced it. **Fetch the sources below when
designing or reviewing a real schema**, and treat them as the authority wherever they disagree with
what follows.

The two posts, both worth reading end to end for the worked example:

- [Creating a single-table design with Amazon DynamoDB](https://aws.amazon.com/blogs/compute/creating-a-single-table-design-with-amazon-dynamodb/)
- [Single-table vs multi-table design in Amazon DynamoDB](https://aws.amazon.com/blogs/database/single-table-vs-multi-table-design-in-amazon-dynamodb/)

The developer guide, starting with these four:

- [NoSQL design for DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-general-nosql-design.html),
  which is where the "as few tables as possible" rule lives.
- [Data modeling foundations](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/data-modeling-foundations.html),
  which sets out AWS's own advantages and disadvantages for both foundations.
- [Partitions and data distribution](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.Partitions.html),
  the mechanism everything else follows from.
- [Best practices for designing and architecting with DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html),
  an index whose sub-pages cover partition keys, sort keys, secondary indexes, large items, time
  series data, many-to-many relationships and querying.

[references/aws-guidance.md](references/aws-guidance.md) collects the mechanics from those sub-pages
in one place, including throughput per partition, write sharding, index projections, sort key
patterns and the read cost of a `Scan`. Read it when the question turns on performance or cost. The
questions about shape are answered here.

[NoSQL Workbench](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/workbench.html)
is the AWS tool for building and visualising a model before writing any code, and it is worth
suggesting to a user who is modelling something substantial.

## Write the access patterns down first

AWS states the ordering as a rule. Do not start designing the schema until the questions it answers
are known. The schema is a consequence of the queries.

Three properties matter before the first attribute is named.

- **Data size**, meaning how much is stored and how much comes back in one request.
- **Data shape**, meaning the shape in the table matches the shape the query wants, with no
  reshaping at read time.
- **Data velocity**, meaning where the peak load lands, which decides how the keys distribute.

Enumerate the patterns and write them where the reviewer of the pull request can see them (the CDK
stack, an ADR, a comment above the key builders). Each entry records what the caller holds, what
comes back, the ordering and the expected cardinality. For a small orders service:

| Access pattern                    | Caller holds | Returns               | Order        |
| --------------------------------- | ------------ | --------------------- | ------------ |
| Get a customer profile            | customer id  | one item              |              |
| Get an order with its lines       | order id     | one order, 1-50 lines | line sku     |
| List a customer's orders          | customer id  | 0-500 orders          | newest first |
| Find a customer by email          | email        | one item              |              |
| List open orders across customers | nothing      | 0-2000 orders         | oldest first |

A pattern that arrives later usually costs a new secondary index or a backfill. It never costs a new
table.

## One table, every entity type

Items sharing a partition key form an **item collection**, stored together and sorted by sort key.
That is the whole mechanism behind single-table design. Related items of different types land in one
collection and one `Query` returns them.

The arguments for it, in the order AWS makes them:

- **Locality of reference.** Keeping related data together is the first general principle in the
  best practices, ahead of every key-design detail. An order and its lines share a partition, and
  one `Query` returns both. The multi-table version issues a `GetItem` for the order and a `Query`
  for the lines, and pays two round trips to assemble one response.
- **Reads cost less.** One query for two items totalling under 4 KB is 0.5 read units eventually
  consistent. Two queries for the same two items cost 1 read unit, because each is billed at 0.5.
  Latency follows the same shape, and two calls average worse than one.
- **Traffic smooths out.** Aggregating several usage patterns onto one table produces a steadier
  overall curve than any single pattern has on its own, in the way an index moves more smoothly than
  a share in it. Provisioned mode reaches a higher utilisation as a result.
- **Cost tracks the item.** A write is charged per kilobyte of the whole item, so a view counter
  living on the same item as the video metadata charges for the metadata on every increment.
  Splitting by write rate is a modelling decision the table boundary cannot make.
- **Operational surface stays flat.** One table means one set of alarms, one backup policy, one
  capacity mode, one stream, one set of IAM statements, and one customer managed key to rotate.
- **It keeps the modelling honest.** A table per entity looks like a relational schema and invites
  relational habits. One table has no shape to fall back on except the access patterns.

Name the table after the service (`orders-service-data`), never after an entity. A table called
`Users` has already lost the argument.

Symptoms of the relational reflex, all of which mean the keys are wrong:

- Two or more `GetItem` calls in sequence to build one response.
- A `Scan` with a `FilterExpression` doing the selection.
- A secondary index added for each new query.
- An `orderId` attribute on the customer item, used as a foreign key by the application.

## Generic key names and entity prefixes

Partition and sort key attributes are named `PK` and `SK`, and secondary index keys `GSI1PK`,
`GSI1SK` and so on. A key named `customerId` can only ever hold a customer.

Every value carries a prefix naming its entity type, and every item carries a `type` attribute for
the deserialiser, for stream consumers and for exports.

```
PK               SK                    type       Attributes
CUSTOMER#c-42    #PROFILE              customer   email, name, createdAt
ORDER#o-981      #ORDER                order      customerId, status, total, placedAt
ORDER#o-981      LINE#sku-0007         orderLine  qty, price
ORDER#o-981      LINE#sku-0031         orderLine  qty, price
```

`Query` on `PK = "ORDER#o-981"` returns the order and every line in one request, in sort key order.
`#ORDER` comes back first because `#` sorts below the letters. A `#` prefix is the usual trick for
pinning a parent item to the top of its item collection.

Sort keys are byte-ordered strings, and hierarchy in them is free. AWS gives
`[country]#[region]#[state]#[county]#[city]#[neighborhood]` as the shape, queryable at every level
with `begins_with` and `between`. A timestamp in ISO 8601 sorts chronologically without parsing. Pad
numbers so `sku-10` sorts after `sku-9`.

Choosing the partition key is also a throughput decision. A key with many distinct values used
evenly (a customer id) distributes well, and one with few values (a status code) or one that
concentrates writes on the current period (a date rounded to the day) does not. Every partition
serves 3,000 read units and 1,000 write units per second.
[references/aws-guidance.md](references/aws-guidance.md) covers the arithmetic, the AWS table of
good and bad keys, and write sharding for the cases that need it.

## Overload the secondary indexes

Keep the number of indexes small. Every global secondary index is a full copy of the attributes it
projects, rewritten whenever a projected attribute changes, and it consumes its own write capacity.
AWS states the rule as "keep the number of indexes to a minimum" and warns that a seldom-used index
costs storage and I/O without buying performance. The default quota caps a table at 20 of them, and
a design that adds one index per access pattern will feel the write cost long before it reaches that
ceiling.

Index overloading is what keeps the count down. The same index attributes carry different meanings
for different entity types:

| Item      | GSI1PK                  | GSI1SK                     | Serves                   |
| --------- | ----------------------- | -------------------------- | ------------------------ |
| customer  | `EMAIL#ada@example.com` | `EMAIL`                    | find a customer by email |
| order     | `CUSTOMER#c-42`         | `PLACED#2026-03-01T09:14Z` | a customer's orders      |
| orderLine | (absent)                | (absent)                   |                          |

Two access patterns, one index, and the line items stay out of it because they carry no `GSI1PK`.
That last part is the **sparse index**. An index keyed on an attribute only some items hold contains
only those items. Set `GSI2PK` to `STATUS#OPEN` while an order is open and remove the attribute when
it closes. The index then holds the open orders and nothing else, and the query for them reads no
closed orders at all.

Prefer a GSI to an LSI. An LSI has to exist when the table is created, cannot be deleted afterwards,
shares the table's throughput, and caps every item collection at 10 GB. A GSI can be added later and
carries its own capacity. The case for an LSI is a strongly consistent read on an alternate sort
key, which a GSI cannot give (GSI reads are eventually consistent, always).

Decide the projection on every index. `ALL` removes fetches and roughly doubles storage and write
cost. See [references/aws-guidance.md](references/aws-guidance.md) for the trade.

## Split items by write rate

The write cost of an item is its whole size rounded up to the next kilobyte. An attribute that
changes constantly, sitting on an item that is mostly static, charges for the static part every
time.

```
PK             SK          type       Attributes
VIDEO#v-3      #METADATA   video      title, description, tags, uploadedAt   (2 KB, rarely written)
VIDEO#v-3      #VIEWS      viewCount  count                                  (1 WCU per increment)
```

Same partition, so one `Query` still returns both. The counter now costs one write unit, down from
two. This split cuts across entity boundaries. A table-per-entity layout has no way to express it.

The same move handles items that outgrow 400 KB. Break the item into chunks under one partition key
and order them by sort key, which AWS calls vertical partitioning.

## Many-to-many is an adjacency list

Model both sides in one table. Top-level entities are partition keys, and a relationship is an item
inside the partition whose sort key is the id of the thing on the other end.

```
PK               SK               type
INVOICE#i-3      #INVOICE         invoice
INVOICE#i-3      BILL#b-7         invoiceBill
INVOICE#i-3      BILL#b-9         invoiceBill
BILL#b-7         #BILL            bill
```

A `Query` on `INVOICE#i-3` gives every bill on the invoice. The other direction comes from an
**inverted index**, a GSI whose partition key is the table's sort key, so a query on `BILL#b-7`
returns every invoice carrying that bill. One extra index buys the reverse of every relationship in
the table.

Where the traversal is graph-shaped and needs several hops at low latency, Amazon Neptune is the
tool AWS points to.

## Denormalise what is stable, and write the copies together

A join is replaced either by co-location or by duplication. Copy the customer name onto the order
item when the order view needs it, and keep the copies consistent in one `TransactWriteItems` (up to
100 items in one call). Where the fan-out is too wide for a transaction, repair from a DynamoDB
stream.

Duplicate attributes that rarely change. An attribute that changes often turns every update into a
fan-out write across every copy, and at that point a second `Query` for the current value is
cheaper.

## Uniqueness is a second item

There is no unique index. A uniqueness rule is an item whose key is the unique value, written in the
same transaction as the entity, both writes conditional on the key being free:

```typescript
await documents.send(new TransactWriteCommand({
  TransactItems: [
    {
      Put: {
        TableName: table,
        Item: { PK: `CUSTOMER#${id}`, SK: "#PROFILE", type: "customer", email },
        ConditionExpression: "attribute_not_exists(PK)",
      },
    },
    {
      Put: {
        TableName: table,
        Item: { PK: `EMAIL#${email}`, SK: "#EMAIL", type: "emailClaim", customerId: id },
        ConditionExpression: "attribute_not_exists(PK)",
      },
    },
  ],
}));
```

Either both land or neither does. The claim item is another entity type in the same table, and it
needs releasing when the email changes.

## Query, never Scan, and never select with a filter

A `FilterExpression` is applied after the read and charged on everything read. Filtering 10,000
items down to 3 costs 10,000 items of read capacity and returns pages that look half-empty. Filters
are for trimming a result set the key condition has already narrowed, and never for choosing which
items to fetch.

A `Scan` in a request path is a modelling failure. It reads the whole table, slows as the table
grows, and takes its capacity from one partition at a time, which throttles the requests that share
that partition. A single 1 MB page of 4 KB items costs 128 eventually consistent read units in one
burst.

In a batch job over the whole table a `Scan` is legitimate. Set `Limit` to cap the page size and use
parallel segments once the table passes about 20 GB.

Watch the 1 MB page limit on `Query` too. Code that reads `Items` without following
`LastEvaluatedKey` silently truncates.

## When a second table earns its place

Each of these is a real reason, and each produces a second table holding several entity types. None
of them produces a table per entity.

- **Whole-table settings that need to differ.** Backups and point-in-time recovery are per table,
  and so are encryption keys and the table class. Mission-critical data mixed with disposable data
  gets backed up as one unit. A multi-tenant application needing a key per tenant needs a table per
  tenant or client-side encryption. Historical data mixed with operational data loses most of the
  Infrequent Access saving.
- **Stream pressure.** One stream carries every change to every entity type, and a shard supports
  about two concurrent readers before throttling. Entities needing separate downstream pipelines
  (orders into Step Functions, registrations into EventBridge) can exhaust that. Lambda event
  filters keep the irrelevant records off the bill, and the Kinesis Client Library does not.
- **Analytics exports.** An immutable event log and a mutable entity set want different export
  strategies. Full exports suit mutable data and streaming suits the log.
- **High-volume time series data.** AWS names this as an explicit exception, along with datasets
  whose access patterns have nothing in common. A table per time period is the usual shape.
- **A different owner.** Another service owning the data means a shared table couples two
  deployments and two IAM policies. The table boundary follows the service boundary.
- **A framework that fights it.** GraphQL resolvers map cleanly onto one entity per table, and
  higher-level SDK mappers struggle when one response holds several classes. AWS lists both as
  disadvantages of single-table design.

Absent one of these, the second table is the SQL habit reasserting itself.

## Keep key construction in one place

Single-table keys are strings with structure, and structure spread across handlers as template
literals drifts. One module owns building and parsing them, and nothing else concatenates a `#`.

```typescript
export const keys = {
  customer: (id: string) => ({ PK: `CUSTOMER#${id}`, SK: "#PROFILE" }),
  order: (orderId: string) => ({ PK: `ORDER#${orderId}`, SK: "#ORDER" }),
  orderLine: (orderId: string, sku: string) => ({ PK: `ORDER#${orderId}`, SK: `LINE#${sku}` }),
  ordersForCustomer: (id: string) => ({ GSI1PK: `CUSTOMER#${id}` }),
};
```

A `Query` over one partition returns several entity types, so the item type is a discriminated union
keyed on the `type` attribute. Parse into that union at the edge of the data access layer and let
the rest of the code hold real types.

## Testing the model

Access patterns are testable, and each one deserves a test that seeds a few items and asserts what
the query returns. The
[`yulin-aws-simulation`](https://github.com/KensioSoftware/kensio.ai/tree/main/plugins/yulin-aws-simulation)
skill covers running those tests against a simulated DynamoDB with the real CDK table definition,
including key schema and index projections.
