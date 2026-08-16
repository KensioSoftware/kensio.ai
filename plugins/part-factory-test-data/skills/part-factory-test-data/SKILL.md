---
name: part-factory-test-data
description: Build test data with @kensio/part-factory, choosing between StaticFactory, DynamicFactory, VariantFactory and MappedFactory, pairing dynamic defaults with faker, and exporting factories from the library that owns the type. Use when writing test fixtures or builders, when a test file is full of object literals, when a shared event, message or payload shape is being hand-written, and when tempted to wrap a factory in a helper function that applies overrides.
---

# Building test data with Part Factory

[Part Factory](https://partfactory.dev/) (`@kensio/part-factory`) builds typed objects for tests: a
factory holds the defaults, and `make(overrides)` returns an object with the overrides applied down
through the nested structure.

The package README is the authority on the API. This skill covers which factory to reach for and
where factories should live.

This skill serves the `isolated-testing-style` skill, which is the general argument for keeping
setup out of test bodies.

## Which factory

- **`StaticFactory`** when the defaults are fixed values. The simplest thing that works, and the
  right default choice.
- **`DynamicFactory`** when the defaults have to be generated fresh for each object. Pair it with
  [`@faker-js/faker`](https://fakerjs.dev/). This is what gives tests their isolation: a random
  email or a UUID means two tests cannot collide, so neither needs tearing down.
- **`VariantFactory`** for a named variation of a base factory, when the variation is worth a name
  in the test. `closedOfferFactory` reads better in ten tests than
  `offerFactory.make({ closesAt: aMinuteAgo })` written ten times.
- **`MappedFactory`** when the output shape differs from the parts you want to override. Its async
  form, `AsyncMappedFactory`, is for when producing the value means awaiting something, such as
  inserting a row or signing a payload.

```typescript
import { DynamicFactory } from "@kensio/part-factory";
import { faker } from "@faker-js/faker";

export const customerFactory = new DynamicFactory<Customer>(() => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  name: faker.person.fullName(),
}));
```

## Reach for MappedFactory only when the map is a real transformation

`MappedFactory` earns its place when the thing you want to override is not shaped like the thing you
want back. Good cases:

- Parts to an encoded form body: `{ email, password }` mapped to a
  `application/x-www-form-urlencoded` string.
- Front matter parts to a file as written on disk: `{ title, tags, body }` mapped to the YAML block
  plus the markdown underneath.
- Components to a formatted identifier: ARN parts mapped to the ARN string.

If the mapping function is copying fields across into an object of the same shape, you wanted a
`DynamicFactory`. An identity map adds a type parameter, a second function and a layer of
indirection, and buys nothing.

## Do not wrap a factory in a function that applies overrides

```typescript
// Anti-pattern. This is make(overrides) with extra steps.
export function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return { ...customerFactory.make(), ...overrides };
}
```

`make(overrides)` already is that function, and it does the job better: its overrides are partial
all the way down the nested structure, where the spread above replaces a nested object whole.

A wrapper that does anything more than pass overrides through is a signal to read rather than to
write. It usually means one of two things:

- **The factory is the wrong shape.** The wrapper is computing something the defaults should be
  computing, or deriving one field from another. Move that into a `DynamicFactory` defaults
  function, which receives the overrides, or into a `MappedFactory` map.
- **The output type is fighting you.** The wrapper is casting, widening or filling in a field the
  type demands but the test does not care about. Fix the type, or use `MappedFactory` so the parts
  and the output are allowed to differ.

The same goes for a wrapper that exists to pass a dependency. Factories take dependencies as a
second argument at call time, so declare them on the factory instead.

## Factories belong beside the type they construct

A library that defines an event, a message or a payload shape should export a factory for it.
Otherwise every consumer hand-rolls the literal, and every copy drifts.

The worked example: an AWS Lambda function URL invocation event, payload format 2.0. It is around
thirty lines, of which two matter to any given test.

```json
{
  "version": "2.0",
  "routeKey": "$default",
  "rawPath": "/upload",
  "rawQueryString": "part=3",
  "headers": { "host": "abc.lambda-url.eu-west-2.on.aws", "user-agent": "..." },
  "queryStringParameters": { "part": "3" },
  "cookies": ["session=abc"],
  "requestContext": {
    "http": { "method": "POST", "path": "/upload", "sourceIp": "127.0.0.1" }
  },
  "body": "...",
  "isBase64Encoded": false
}
```

Hand-writing that in three test files gives three copies that drift as the shape changes. It also
carries a real trap: the path is in the event twice, as `rawPath` and as `requestContext.http.path`,
and the query string is in it twice, as `rawQueryString` and as `queryStringParameters`. A test that
sets one and not the other passes against a handler reading the field the test set, and fails in
production against the same handler reading the other one.

A `MappedFactory` removes both problems. The parts are what a test cares about, and the map is what
fills the event in consistently:

```typescript
import { MappedFactory } from "@kensio/part-factory";

interface FunctionUrlRequestParts {
  method: string;
  path: string;
  query: Record<string, string>;
  body?: string;
}

export const functionUrlEventFactory = new MappedFactory<
  FunctionUrlRequestParts,
  FunctionUrlEvent
>(
  () => ({ method: "GET", path: "/", query: {} }),
  (parts) => ({
    version: "2.0",
    routeKey: "$default",
    rawPath: parts.path,
    rawQueryString: new URLSearchParams(parts.query).toString(),
    queryStringParameters: parts.query,
    // ... and the rest, filled in once.
    requestContext: {
      http: { method: parts.method, path: parts.path, sourceIp: "127.0.0.1" },
    },
    body: parts.body,
    isBase64Encoded: false,
  }),
);

// In a test, the two lines that matter are the two lines written.
const event = functionUrlEventFactory.make({ method: "POST", path: "/upload" });
```

The path can no longer disagree with itself, because there is one place it is set.

Export the factory from the package that owns the type, from a test-support entry point so it does
not ship in the production bundle. Consumers then get a correct event with one call, and a change to
the shape is made once.
