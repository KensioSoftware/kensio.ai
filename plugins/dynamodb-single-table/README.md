# @kensio/dynamodb-single-table

An agent skill for modelling data in Amazon DynamoDB, where the default is one table per service
holding every entity type.

Nearly all of the data modelling advice an LLM has read is about SQL, and it carries over badly. The
result is a table per entity, a join in the application layer, and a `Scan` wherever the keys fall
short. This skill interrupts that reflex and gives the modelling technique that replaces it.

It follows the AWS guidance, which says the same thing. "You should maintain as few tables as
possible in a DynamoDB application." The sources are two AWS posts,
[Creating a single-table design](https://aws.amazon.com/blogs/compute/creating-a-single-table-design-with-amazon-dynamodb/)
and
[Single-table vs multi-table design](https://aws.amazon.com/blogs/database/single-table-vs-multi-table-design-in-amazon-dynamodb/),
together with the
[NoSQL design](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-general-nosql-design.html),
[data modeling](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/data-modeling-foundations.html),
[partitioning](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.Partitions.html)
and
[best practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
pages of the developer guide.

The skill carries the links and tells the agent to fetch them when designing or reviewing a real
schema. A summary goes stale, quotas move, and the worked examples hold detail no summary keeps.

## Install

Into any agent that reads `SKILL.md`:

```bash
npx @kensio/skills add dynamodb-single-table
```

That copies the skill directory into `.agents/skills/`, where Codex, Cursor, Copilot, Gemini CLI and
the other implementations of the specification look for one. Pass `--agent claude` for
`.claude/skills/`, `--agent copilot` for `.github/skills/`, and `--user` to install it for every
project at once.

Claude Code also takes it as a plugin:

```bash
claude plugin marketplace add KensioSoftware/kensio.ai
claude plugin install dynamodb-single-table@kensio
```

Or pin it in a repository as a dependency:

```bash
npm install @kensio/dynamodb-single-table
```

Every skill is also published as a zip on each
[release](https://github.com/KensioSoftware/kensio.ai/releases), for a machine with no npm reach.
Unzip it into `.agents/skills/` and it is installed.

## What it covers

**Write the access patterns down first.** AWS states this as a rule. Do not start designing the
schema until the questions it answers are known. Each entry records what the caller holds, what
comes back, the ordering and the cardinality. Data size, data shape and data velocity are what
decide the keys. A pattern that arrives later costs a secondary index or a backfill, and never a new
table.

**One table, every entity type.** Items sharing a partition key form an item collection, held
together and sorted by sort key. That is the whole mechanism. An order and its lines come back from
one `Query`, where the multi-table version pays two round trips. One query for two items under 4 KB
costs 0.5 read units eventually consistent, and two queries for the same items cost 1. One table
also means one set of alarms, one backup policy, one stream and one key to rotate. Name it after the
service, never after an entity, because a table called `Users` has already lost the argument.

**Generic key names and entity prefixes.** `PK`, `SK`, `GSI1PK` and `GSI1SK`, with every value
prefixed by its entity type and every item carrying a `type` attribute. A key named `customerId` can
only ever hold a customer.

**Overload the secondary indexes, and make them sparse.** Keep the number of indexes small. Every
GSI is a full copy of the attributes it projects, rewritten whenever one of them changes, and a
design that adds an index per access pattern feels the write cost long before it reaches the AWS
ceiling of 20. The same index attributes carry different meanings for different entity types. An
index keyed on an attribute only some items hold contains only those items, so setting `GSI2PK` to
`STATUS#OPEN` while an order is open builds an index of open orders that reads no closed ones.

**Split items by write rate.** A write is charged on the whole item rounded up to the kilobyte, so a
view counter sharing an item with 2 KB of video metadata pays for the metadata on every increment.
Keep the counter on its own item in the same partition. This split cuts across entity boundaries. A
table-per-entity layout has no way to express it.

**Uniqueness is a second item.** There is no unique index. The rule is an item keyed on the unique
value, written in the same `TransactWriteItems` as the entity, both conditional on the key being
free.

**Many-to-many is an adjacency list.** Entities are partition keys and a relationship is an item in
the partition keyed on the id at the other end. One inverted index, a GSI whose partition key is the
table's sort key, buys the reverse of every relationship in the table.

**Query, never Scan, and never select with a filter.** A `FilterExpression` runs after the read and
is charged on everything read. Filtering 10,000 items down to 3 costs 10,000 items of read capacity.
A single 1 MB scan page of 4 KB items costs 128 eventually consistent read units in one burst, taken
from one partition, which throttles everything else sharing it.

**Know the reasons for a second table.** Whole-table settings that need to differ (backup,
encryption, table class), stream pressure past two consumers per shard, analytics exports,
high-volume time series data, a different owning service, or a framework that fights the design.
Each produces a second table holding several entity types. None of them produces a table per entity.

## The reference file

[`reference/aws-guidance.md`](skills/dynamodb-single-table/reference/aws-guidance.md) holds the
mechanics the rules rest on, loaded only when a decision turns on them. Throughput per partition
(3,000 read units and 1,000 write units), the AWS table of good and bad partition keys, write
sharding with random and calculated suffixes, sort key hierarchy and version history patterns, index
projections and LSI fetches, the 10 GB item collection limit, the three routes past 400 KB, what a
`Scan` costs, the materialized graph pattern, and AWS's own list of what single-table design costs
you.

## Related skills

- [`yulin-aws-simulation`](https://github.com/KensioSoftware/kensio.ai/tree/main/plugins/yulin-aws-simulation)
  runs the tests for each access pattern against a simulated DynamoDB, using the real CDK table
  definition.

Part of [kensio.ai](https://github.com/KensioSoftware/kensio.ai). Licensed under the Apache License
2.0. See the [LICENSE](https://github.com/KensioSoftware/kensio.ai/blob/main/LICENSE) in the
repository root.
