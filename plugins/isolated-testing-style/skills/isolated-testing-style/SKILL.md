---
name: isolated-testing-style
description: Write tests that start from given/when/then, use real collaborators through simulation rather than stubs and mocks, take their isolation from randomised data rather than shared setup and teardown, and assert behaviour rather than call counts. Use when writing or reviewing tests, when a test needs a collaborator faked, when reaching for a mock, spy, `toHaveBeenCalledWith`, `beforeEach`/`afterEach` fixtures or a hardcoded expected hash, when test setup has grown tangled, and when asked "how should I test this?".
license: Apache-2.0
metadata:
  version: "1.11.0"
---

# Isolated testing style

An opinionated way of writing tests. The examples are TypeScript and vitest, but the rules are about
test design and hold for any framework. Each rule exists because of a specific failure it would have
caught.

## Start with Given, When, Then

Write the three comments before the test body, and before the code they will drive.

```typescript
it("refuses an order once the offer has closed", async () => {
  // Given an offer that closed while the customer was on the page.
  // When the order is placed against it.
  // Then it is refused rather than accepted late.
});
```

Starting at this point, and not drifting to it, does three things.

**It lowers the cost of starting.** You only have to say what the situation is, what happens, and
what should result. That is a smaller question than "how do I test this?", and you can usually
answer it before you can answer the bigger one.

**It designs the interface.** Filling in `// When` forces you to name the single action under test,
in the caller's vocabulary. A step you cannot write as one `// When` usually means the interface is
wrong.

**It keeps the test readable as documentation.** Tests are read far more often than they are
written, and without the structure it is easy to produce a body where essential behaviour and
incidental setup look alike.

Then fill each comment in with the case it covers, and never with a restatement of the code:

```typescript
it("refuses an order once the offer has closed", async () => {
  // Given an offer that closed while the customer was on the page.
  const offer = await offerFactory.make({ closesAt: aMinuteAgo });

  // When the order is placed against it.
  const placing = placeOrder(orderFactory.make({ offerId: offer.id }));

  // Then it is refused rather than accepted late.
  await expect(placing).rejects.toThrow(OfferClosedError);
});
```

`// Given an offer` restates the code and adds no information.
`// Given an offer that closed while the customer was on the page` says which case this is and why
it matters. This holds whether or not the test is written first.

## Prefer real collaborators through simulation

A stub asserts that your code called something. A simulator asserts that it called the service
correctly.

That difference is the whole argument. A stub answers whatever you told it to answer. It agrees with
your understanding of the API by construction. It cannot disagree with you, which means it cannot
find the case where your understanding is wrong. A simulator holds real state and applies the real
rules. A wrong call fails at the point the real service would have failed.

The evidence comes from a real project. Replacing AWS SDK stubs with a simulator immediately caught
two bugs that had already shipped.

- A Secrets Manager secret name ending in a hyphen and six characters. AWS appends exactly that
  suffix to a secret ARN. The name was ambiguous with the ARN form, which AWS advises against. The
  stub had no opinion, because a stub has no naming rules.
- A Cognito `SECRET_HASH` computed the wrong way. The stub accepted it, because the stub was never
  going to check a signature.

So the order to reach for things:

1. A simulator that holds real state and applies real rules.
2. The real thing, when it runs in process and needs no external service.
3. A stub, only for something with no rules worth modelling, such as a clock or a random source.

The first two options need the implementation to be swappable, so give each collaborator a single
point of entry, one place that wires the real service in production and a simulation in tests. The
driver pattern is one way to arrange that, but the name matters far less than the swap having one
home.

Simulating in process pays off beyond avoiding stubs. No deployment is needed before running the
tests, a debugger steps through the collaborator's state alongside your own, and no state is shared
between processes, so several layers can be exercised together and still run in parallel at the
speed of a unit test.

Be honest about the limit. An in-memory implementation only approximates the real service, and
cannot be relied on to behave identically. Keep a thin layer of tests against the real thing for the
flows where that matters, and treat any divergence you find as a bug in the simulation rather than a
quirk to work around.

## Keep setup cheap and independent

Tangled shared fixtures come from economics. Discipline has little to do with it. Teams share setup
roughly in proportion to how expensive it is to build. When getting a test into the right state
means threading through a web of existing fixtures, reusing what is already there is the rational
move, and each reuse adds another edge to the graph. That is how a suite arrives at setup that no
one dares to touch.

The fix is to share differently. Shared factories for test entities are exactly what you want. A
factory that constructs a type is worth writing once and using everywhere. What has to be avoided is
those factories getting tangled up with each other. Each piece of setup should stand on its own.

Independence comes from taking dependencies explicitly rather than reaching for ambient state. A
factory that is handed what it needs stays pure, and the test decides what to hand it.
`@kensio/part-factory` builds this in. Factories take a `dependencies` object as a second argument
at call time. A factory that needs a simulated AWS is handed one, and never goes looking.

```typescript
// Given an order that exists in this test's own simulated AWS.
const simAws = new SimAws();
const order = await orderFactory.make({ total: 5000 }, { simAws });
```

A factory built that way can be shared as widely as you like and still stand on its own, because
everything it does is independent of what another factory did first. Prefer collaborators and
factories that need only instantiation, with no side effects, no cleanup and no coordination.

For a step specific to one test, ask whether the step belongs to the test or the test belongs to the
step. A helper confined to one file can be pulled back inline later if it stops earning its place,
whereas a fixture that a large part of the suite is built on cannot. Reversibility is the thing to
preserve, and locality on its own earns little.

## Take isolation from randomised data

Randomised values make collisions impossible. No teardown is required, and there is no ordering to
depend on. Randomised is enough. Guaranteed uniqueness is unnecessary, and a UUID has no realistic
chance of colliding anyway.

Do not do this:

```typescript
// Anti-pattern: shared name, mutable handle, teardown to undo it.
let bucketName: string;

beforeEach(async () => {
  bucketName = "uploads-bucket";
  await createBucket(bucketName);
});

afterEach(async () => {
  await emptyBucket(bucketName);
  await deleteBucket(bucketName);
});
```

That test cannot run beside another test using the same name, the `let` is only mutable so that
`afterEach` can reach it, and a failure part way through leaves the next test to fail for a reason
unrelated to it.

Do this instead:

```typescript
it("serves an uploaded object", async () => {
  // Given a bucket no other test can be talking about.
  const bucketName = `uploads-${faker.string.uuid()}`;
  await createBucket(bucketName);

  // ...
});
```

The environment those tests run against can be shared, and should be built the way production is
built. A realistic environment that several tests read from is closer to production than a minimal
one rebuilt per test, and it is faster. The isolation comes from the names and identifiers, so
sharing the environment is free.

Faker is the source of these values. Prefer a generator that produces a realistic value of the right
kind (`faker.internet.email()`, `faker.string.uuid()`, `faker.company.name()`) over a counter or a
literal with a suffix. The test data also exercises the shapes production data has.

## Assert observable behaviour

A call count asserts how the code is written today. A behaviour assertion holds however it is
written, which is what lets you refactor.

To prove a value is cached, do not count calls. Delete the underlying resource, then show the cached
value still comes back:

```typescript
it("keeps serving the secret after it is deleted", async () => {
  // Given a secret that has been read once, so it is cached.
  const first = await config.databasePassword();

  // When the underlying secret goes away.
  await simAws.secretsManager().deleteSecret(
    new DeleteSecretCommand({ SecretId: secretName }),
  );

  // Then the cached value is still served, without going back to the service.
  expect(await config.databasePassword()).toEqual(first);
});
```

To prove a retry, make the first call fail and the second succeed, then assert on the result:

```typescript
// Given an endpoint that fails once and then works.
// When the client calls it.
// Then it gets the successful response.
```

Both hold whether the cache is a `Map`, a memoised promise or a decorator, and whether the retry is
a loop, a middleware or a library.

## Never pin a value computed by the code under test

Pinning a hash you generated by running the same function only proves the function is deterministic.
It will keep passing after the function becomes wrong, as long as it is wrong consistently.

```typescript
// Anti-pattern: this string came from running computeSecretHash.
expect(computeSecretHash(username, clientId, clientSecret)).toBe(
  "z0Xq9k1e4mVQ...",
);
```

Two ways out, in order of preference:

1. Let a real implementation validate it. A simulated Cognito checks a `SECRET_HASH` the way Cognito
   checks it. A sign-in that succeeds against the simulation is evidence the hash is right.
2. Pin against an independent authority, such as a value from the service's own documentation, a
   published test vector, or a value produced by a different implementation.

The same rule covers snapshot tests of anything the code under test formats. A snapshot records what
the code does, and stays silent on what it should do.

## Keep the top level to imports

In an ideal vitest or jest file, the only things outside the top-level `describe()` are the imports.
State, construction and helpers all live inside it. The file reads as a description of behaviour and
not as a program that happens to contain some tests.

```typescript
import { describe, expect, it } from "vitest";
import { faker } from "@faker-js/faker";

import { placeOrder } from "./place-order";
import { offerFactory } from "./order.test-support";

describe("placing an order", () => {
  // Everything else — state, helpers, tests — lives in here.
});
```

This is mostly a consequence of the other rules and adds little on its own. What usually accumulates
at the top level of a test file is module-level state the tests share, a mutable handle that exists
so `afterEach` can reach it, and hoisted mock registrations. The rules above have already turned
down all three. So a top level that will not stay empty is a useful signal that something further up
has slipped. Imported factories are fine here. They arrive as imports precisely because they stand
on their own.

## Put test support beside the code

A test file should hold tests. Where support lives depends on what it is for.

A factory for a **type** belongs beside the type it constructs, exported. That no consumer ever
hand-rolls the literal:

```
src/orders/
├── order.ts
├── order.test.ts
└── order.test-support.ts     # factories and helpers for order.ts
```

A library that defines a shape other code has to construct should export the factory for it.

A step written for **one test** stays in that test's file, inside the `describe`. Promoting it later
when another test wants it is fine. Make it independent first, so what spreads is a self-contained
factory (not a dependency on how some other test left things).

If a test file is mostly setup, that is a signal. The fix is usually cheaper construction. A shared
fixture treats the symptom. Scroll the file and see how much of it is `it(...)` bodies making
assertions.

## Tools that help

These serve the style. The style holds without them.

- [Faker](https://fakerjs.dev/) for randomised, realistic values.
- [`@kensio/part-factory`](https://partfactory.dev/) for typed factories that need only
  instantiation. See the `part-factory-test-data` skill.
- [`@kensio/yulin`](https://yulinsim.dev/) simulates AWS in process, when AWS is the collaborator.
  See the `yulin-aws-simulation` skill.
