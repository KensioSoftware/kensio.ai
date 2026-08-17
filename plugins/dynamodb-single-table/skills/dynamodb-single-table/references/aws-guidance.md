# Mechanics behind the modelling rules

The numbers and patterns the [SKILL.md](../SKILL.md) rules rest on, collected from the DynamoDB
developer guide. Read this when the question turns on cost, throughput or size. Fetch the linked
pages when a decision rests on an exact figure, because quotas move.

## Partitions and throughput

A table is stored in partitions, each backed by SSD and replicated across Availability Zones. AWS
manages them and never exposes them directly. More partitions appear when provisioned throughput
rises past what the current ones serve, and when an existing partition fills.

DynamoDB hashes the partition key to choose the partition. Items sharing a partition key value form
an **item collection**, held together and sorted by sort key, which is what makes a range query over
one collection cheap. Where the table carries no local secondary index, DynamoDB splits an item
collection across as many partitions as it needs, and there is no ceiling on the number of distinct
sort key values under one partition key.

**Every partition serves 3,000 read units and 1,000 write units per second.** One read unit is one
strongly consistent read of an item up to 4 KB, or two eventually consistent reads. One write unit
is one write of an item up to 1 KB. Item size multiplies this. A 20 KB item costs 5 read units per
consistent read, which puts the ceiling at 600 reads per second against that one item.

Source
[Partitions and data distribution](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.Partitions.html)
and
[Best practices for partition keys](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html).

## Choosing a partition key that spreads

Throughput efficiency rises with the ratio of partition key values accessed to partition key values
that exist. The AWS comparison:

| Partition key value                                             | Uniformity |
| --------------------------------------------------------------- | ---------- |
| User id, in an application with many users                      | Good       |
| Status code, where few codes exist                              | Bad        |
| Creation date rounded to a day, hour or minute                  | Bad        |
| Device id, where devices are accessed at similar intervals      | Good       |
| Device id, where one device is far more popular than the others | Bad        |

The date case is the one that catches people. Every item created today lands on one partition key
value and therefore one physical partition.

A table small enough to fit in a single partition, allowing for growth, and whose throughput stays
inside one partition's limits, will not throttle whatever the key looks like.

Source
[Designing partition keys to distribute your workload](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-uniform-load.html).

## Write sharding

Where the natural key concentrates writes, widen the key space by appending a suffix.

**Random suffix.** Append a random number in a fixed range, giving `2026-07-09.1` through
`2026-07-09.200`. Writes spread evenly. Reading one item back becomes impossible without knowing
which suffix it took, and reading the whole day means one `Query` per suffix followed by a merge.

**Calculated suffix.** Derive the suffix from an attribute the reader already holds, such as the sum
of the UTF-8 code points of an order id modulo 200 plus 1. Writes spread the same way, and a
`GetItem` for a known order still works because the suffix is recomputable. Reading the whole day
still costs one `Query` per suffix.

A GSI can be sharded the same way to make selective queries parallel.

Source
[Using write sharding](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-sharding.html).

## Sort key patterns

**Hierarchy.** A composite sort key defines one-to-many relationships queryable at any level, using
`begins_with`, `between`, `>` and `<`. The AWS example is
`[country]#[region]#[state]#[county]#[city]#[neighborhood]`.

**Version history.** Keep two copies of every item. One carries a `v0_` sort key prefix and holds
the current version, and each revision is written under the next number up (`v1_`, `v2_` and so on)
with its contents also copied over `v0_`. The current version is then a query on the `v0_` prefix,
and the history is the rest of the partition.

Source
[Best practices for sort keys](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-sort-keys.html).

## Secondary indexes

A table gets 20 global secondary indexes (default quota) and 5 local secondary indexes. AWS says
global indexes are usually the more useful of the two.

**Keep the number to a minimum.** An index that is seldom queried adds storage and I/O cost and buys
no performance.

**Choose projections deliberately.** A smaller index costs less and outperforms the base table by
more. Project the attributes the queries actually return. `ALL` removes every fetch and in most
cases doubles storage and write cost. Where an index entry is under 1 KB the projection is free up
to that point, because writes round up.

**Avoid fetches on the read path.** Querying an LSI for an attribute it does not project makes
DynamoDB read the whole item from the table, adding latency and I/O. Attributes queried occasionally
have a habit of becoming attributes queried always.

**Watch LSI item collections.** An item collection covers the table items and every LSI item sharing
a partition key, and it cannot exceed 10 GB. Writes fail once it does. Pass
`ReturnItemCollectionMetrics` on writes and alarm before the limit. An LSI cannot be deleted after
creation, which makes the decision to add one permanent.

Source
[General guidelines for secondary indexes](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-indexes-general.html).

## Large items

The item size limit is 400 KB, and exceeding it fails the write with a `ValidationException`. Pass
`ReturnConsumedCapacity` on writes and alarm on items approaching the limit.

Three ways out, in the order worth trying:

- **Vertical partitioning.** Break the item into several items under one partition key, ordered by
  sort key. This is the single-table answer and keeps everything queryable.
- **Compression.** GZIP or LZO into a `Binary` attribute. A compressed attribute cannot be filtered
  or queried on.
- **S3.** Store the payload as an object and the object key in the item, with the item's primary key
  in the S3 object metadata pointing back. No transaction spans the two, so the application owns the
  cleanup of orphaned objects.

Source
[Best practices for storing large items](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-use-s3-too.html).

## What a Scan actually costs

A `Scan` reads the whole table or index and then discards what the filter rejects. It slows as the
table grows.

A single 1 MB page of 4 KB items costs 128 eventually consistent read units, or 256 strongly
consistent. That arrives as one spike, and it lands on one partition, because the items a scan reads
sit next to each other. Requests sharing that partition throttle.

Where a scan is needed:

- Set `Limit` to shrink the page, which spreads the cost and leaves gaps for other traffic.
- Use parallel segments once the table passes about 20 GB, starting at roughly one segment per 2 GB,
  and only where the provisioned read capacity is not already busy.
- Retry throttled requests with exponential backoff.

Source
[Best practices for querying and scanning](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-query-scan.html).

## Adjacency lists and the materialized graph

Top-level entities become partition keys, and each relationship becomes an item in the partition
whose sort key is the id at the other end. Data duplication stays minimal and the forward query is a
plain `Query`.

The reverse direction comes from an **inverted index**, a global secondary index whose partition key
is the table's sort key.

The materialized graph pattern extends this. Edge items carry `Type` and `Target` attributes
composed into a `TypeTarget` key, one overloaded GSI indexes a `Data` attribute holding dates,
names, places and skills, and a second GSI on `TypeTarget` answers reverse lookups. Aggregations
large enough to run hot (everyone born on one date, everyone with one skill) want sharding across
logical partitions.

Multi-hop traversal at millisecond latency is Amazon Neptune's job. AWS says so on the many-to-many
page itself.

Source
[Best practices for many-to-many relationships](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-adjacency-graphs.html).

## AWS's own trade-off lists

Worth reading in full at
[Data modeling foundations](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/data-modeling-foundations.html),
because they are the most honest account of the cost of single-table design.

What AWS counts against single-table design. The learning curve is steep because the design runs
opposite to relational instinct, whole-table settings (backup, encryption, table class) apply to
every entity at once, streams carry every change whether or not a consumer wants it, GraphQL is
harder to implement, and higher-level SDK mappers struggle with one response holding several
classes.

What AWS counts for it. Data locality, fewer read units and fewer round trips, one set of
permissions and alarms, one key to rotate, capacity averaged across entities, and traffic that
smooths as patterns aggregate.

AWS's summary of when multiple tables are the right answer is short. Where the access patterns never
query several entities together, multiple tables are good and sufficient.
