---
name: part-factory-test-data
description: Build test data with @kensio/part-factory, keeping in the factory everything a test does not care about, passing dependencies at call time so factories stay independent, and choosing between StaticFactory, DynamicFactory, VariantFactory, MappedFactory and AsyncMappedFactory. Use when writing test fixtures or builders, when a test file is full of object literals, when a shared event, message or payload shape is being hand-written, when a required field is about to be made optional to ease test setup, and when tempted to wrap a factory in a helper function that applies overrides.
---

# Building test data with Part Factory

[Part Factory](https://partfactory.dev/) (`@kensio/part-factory`) builds typed objects for tests. A
factory holds the defaults, and `make(overrides)` returns an object with the overrides applied down
through the nested structure.

The package README is the authority on the API. This skill covers what to put in a factory, where
factories should live, and which one to reach for.

It serves the `isolated-testing-style` skill. Factories are what make building state inside each
test cheap enough that nobody reaches for a shared fixture in the first place.

## Say only what the test is about

A factory defines every value the test ignores. The test can state only the values it does. That is
the whole point of one.

Without it, a test opens with twenty lines of construction and it is unclear which of them the
assertions actually depend on. With it, the lines that are there are the lines that matter:

```typescript
it("charges VAT on the order total", () => {
  // Given an order whose lines add up to a total the assertion depends on.
  const order = orderFactory.make({ lines: [{ price: 1000 }, { price: 2000 }] });

  // When it is priced.
  const priced = priceOrder(order);

  // Then VAT is a fifth of that total.
  expect(priced.vat).toBe(600);
});
```

The prices are written down because the assertion is arithmetic on them. The order id, the customer
id and the dates stay with the factory, because the test would read the same whatever they were. The
rule is that simple: **if an assertion depends on a value, put it in the test. Otherwise let the
factory supply it.**

This also removes a pressure that quietly damages production types. When constructing an object by
hand is painful, the tempting fix is to mark its required fields optional so tests can skip them,
weakening the type for every caller in order to serve the tests. A factory makes the setup cheap.
The type can go on saying what is actually required.

## Overrides are a deep partial

Overrides merge into the defaults, all the way down the nested structure. That is what makes "state
only what matters" possible. A test can set one field three levels deep and leave its siblings
alone.

Two consequences worth knowing:

- Arrays override by index, so `{ lines: [{ price: 1000 }] }` replaces the first default line and
  leaves any others in place.
- An empty array leaves the defaults in place. To assert on emptiness, build the case some other way
  rather than expecting `{ lines: [] }` to do it.

## Which factory

- **`StaticFactory`** when the defaults are fixed values. The simplest thing that works, and the
  right default choice.
- **`DynamicFactory`** when the defaults have to be generated fresh for each object. Pair it with
  [`@faker-js/faker`](https://fakerjs.dev/). This is what gives tests their isolation. A random
  email or a UUID means two tests cannot collide, so tearing down is unnecessary.
- **`VariantFactory`** for a named variation of a base factory, when the variation is a concept the
  tests talk about. `closedOfferFactory` reads better in ten tests than
  `offerFactory.make({ closesAt: aMinuteAgo })` written ten times.
- **`MappedFactory`** when the output shape differs from the parts you want to override.
- **`AsyncMappedFactory`** when producing the value means awaiting something, such as inserting a
  row or signing a payload.

```typescript
import { DynamicFactory } from "@kensio/part-factory";
import { faker } from "@faker-js/faker";

export const customerFactory = new DynamicFactory<Customer>(() => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  name: faker.person.fullName(),
}));
```

## Add a variant only for a shared meaning

A variant earns its name when several tests mean the same thing by it. One test that needs an
unusual value should write that value down inline, and leave the factories alone.

The failure mode is a directory of `cancelledOrderWithRefundAndNoAddressFactory` names, each used
once, where reading a test means going to find out what its factory actually sets. Writing the field
in the test is shorter and says more.

## Reach for MappedFactory only when the map is a real transformation

`MappedFactory` earns its place when the thing you want to override has a different shape from the
thing you want back. Good cases:

- Parts to an encoded form body: `{ email, password }` mapped to a
  `application/x-www-form-urlencoded` string.
- Front matter parts to a file as written on disk: `{ title, tags, body }` mapped to the YAML block
  plus the markdown underneath.
- Components to a formatted identifier: ARN parts mapped to the ARN string.

If the mapping function is copying fields across into an object of the same shape, you wanted a
`DynamicFactory`. An identity map adds a type parameter, a second function and a layer of
indirection, and buys little.

## Pass dependencies at call time

A factory that needs something from the outside world (a store, a client, a configured host)
declares it as a third type parameter and receives it as the second argument to `make`:

```typescript
export const storedOrderFactory = new AsyncMappedFactory<
  OrderParts,
  Order,
  { orders: OrderStore }
>(
  () => ({ total: faker.number.int({ min: 100, max: 10_000 }) }),
  async (parts, { orders }) => orders.insert({ id: faker.string.uuid(), ...parts }),
);

// In a test, which decides what to hand it.
const order = await storedOrderFactory.make({ total: 5000 }, { orders });
```

Dependencies are given at call time rather than held by the factory, and are used as they are given,
never fetched or awaited. That is what keeps a factory shareable. It holds no state of its own,
reaches for no ambient state, and cannot depend on what another factory did first. A factory built
this way can be used in every test file in the codebase and still stand on its own.

Keep each dependency as narrow as the factory actually needs. An `OrderStore` is a dependency. The
whole application never is. A wide dependency is how state starts leaking between tests that were
supposed to be independent.

## Call the factory directly

```typescript
// Anti-pattern. This is make(overrides) with extra steps.
export function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return { ...customerFactory.make(), ...overrides };
}
```

`make(overrides)` already is that function, and it does the job better. Its overrides are partial
all the way down the nested structure, where the spread above replaces a nested object whole.

A wrapper that does anything more than pass overrides through is a signal to read and never to
write. It usually means one of two things:

- **The factory is the wrong shape.** The wrapper is computing something the defaults should be
  computing, or deriving one field from another. Move that into a `DynamicFactory` defaults
  function, which receives the overrides, or into a `MappedFactory` map.
- **The output type is fighting you.** The wrapper is casting, widening or filling in a field the
  type demands but the test ignores. Fix the type, or use `MappedFactory` so the parts and the
  output are allowed to differ.

The same goes for a wrapper that exists to pass a dependency. Declare it on the factory instead.

## Factories belong beside the type they construct

A library that defines an event, a message or a payload shape should export a factory for it.
Otherwise every consumer hand-rolls the literal, and every copy drifts.

The worked example is an AWS Lambda function URL invocation event, payload format 2.0. It is around
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
carries a real trap. The path is in the event twice, as `rawPath` and as `requestContext.http.path`,
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
