---
name: isolated-testing-style
description: Write tests that use real collaborators through simulation instead of stubs and mocks, take their isolation from randomised data rather than setup and teardown, and assert behaviour rather than call counts. Use when writing or reviewing tests, when a test needs a collaborator faked, when reaching for a mock, spy, `toHaveBeenCalledWith`, `beforeEach`/`afterEach` fixtures or a hardcoded expected hash, and when asked "how should I test this?".
---

# Isolated testing style

An opinionated way of writing tests, mostly for TypeScript and vitest. Each rule
below exists because of a specific failure it would have caught.

Two Kensio packages serve this style, and this skill assumes them where relevant:
[`@kensio/yulin`](https://yulinsim.dev/) simulates AWS in process, and
[`@kensio/part-factory`](https://partfactory.dev/) builds the test data. Install the
`yulin-aws-simulation` and `part-factory-test-data` skills alongside this one for
their APIs.

## Prefer real collaborators through simulation

A stub asserts that your code called something. A simulator asserts that it called
the service correctly.

That difference is the whole argument. A stub answers whatever you told it to
answer, so it agrees with your understanding of the API by construction. It cannot
disagree with you, which means it cannot find the case where your understanding is
wrong. A simulator holds real state and applies the real rules, so a wrong call
fails at the point the real service would have failed.

The evidence: on a real project, replacing AWS SDK stubs with Yulin interception
immediately caught two bugs that had already shipped.

- A Secrets Manager secret name ending in a hyphen and six characters. AWS appends
  exactly that suffix to a secret ARN, so the name was ambiguous with the ARN form,
  which AWS advises against. The stub had no opinion, because a stub has no naming
  rules.
- A Cognito `SECRET_HASH` computed the wrong way. The stub accepted it, because the
  stub was never going to check a signature.

So the order to reach for things:

1. A simulator that holds real state and applies real rules (Yulin for AWS, an
   in-memory implementation of your own port for your own code).
2. The real thing, when it runs in process and needs nothing external.
3. A stub, only for something with no rules worth modelling, such as a clock or a
   random source.

## Get isolation from the data, not from setup and teardown

Randomised values make collisions impossible, so there is nothing to tear down and
no ordering to depend on. Randomised is enough. Guaranteed uniqueness is not
needed, and a UUID has no realistic chance of colliding anyway.

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

That test cannot run beside another test using the same name, the `let` is only
mutable so that `afterEach` can reach it, and a failure part way through leaves the
next test to fail for a reason that has nothing to do with it.

Do this instead:

```typescript
it("serves an uploaded object", async () => {
  // Given a bucket no other test can be talking about.
  const bucketName = `uploads-${faker.string.uuid()}`;
  await createBucket(bucketName);

  // ...
});
```

The environment those tests run against can be shared, and should be built the way
production is built. A realistic environment that several tests read from is closer
to production than a minimal one rebuilt per test, and it is faster. The isolation
comes from the names and identifiers, so sharing the environment costs nothing.

Faker is the source of these values. Prefer a generator that produces a realistic
value of the right kind (`faker.internet.email()`, `faker.string.uuid()`,
`faker.company.name()`) over a counter or a literal with a suffix, so the test data
also exercises the shapes production data has.

## Assert behaviour, not call counts

A call count asserts how the code is written today. A behaviour assertion holds
however it is written, which is what lets you refactor.

To prove a value is cached, do not count calls. Delete the underlying resource, then
show the cached value still comes back:

```typescript
it("keeps serving the secret after it is deleted", async () => {
  // Given a secret that has been read once, so it is cached.
  const first = await config.databasePassword();

  // When the underlying secret goes away.
  await simAws.secretsManager().deleteSecret({ SecretId: secretName });

  // Then the cached value is still served, without going back to the service.
  expect(await config.databasePassword()).toEqual(first);
});
```

To prove a retry, make the first call fail and the second succeed, then assert on
the result:

```typescript
// Given an endpoint that fails once and then works.
// When the client calls it.
// Then it gets the successful response.
```

Both hold whether the cache is a `Map`, a memoised promise or a decorator, and
whether the retry is a loop, a middleware or a library.

## Never pin a value computed by the code under test

Pinning a hash you generated by running the same function only proves the function
is deterministic. It will keep passing after the function becomes wrong, as long as
it is wrong consistently.

```typescript
// Anti-pattern: this string came from running computeSecretHash.
expect(computeSecretHash(username, clientId, clientSecret)).toBe(
  "z0Xq9k1e4mVQ...",
);
```

Two ways out, in order of preference:

1. Let a real implementation validate it. A simulated Cognito checks a `SECRET_HASH`
   the way Cognito checks it, so a sign-in that succeeds against the simulation is
   evidence the hash is right.
2. Pin against an independent authority: a value from the service's own
   documentation, a published test vector, or a value produced by a different
   implementation.

The same rule covers snapshot tests of anything the code under test formats. A
snapshot records what the code does, not what it should do.

## Put test support beside the code, not in the test file

A test file should hold tests. Factories, fixtures, builders and helpers go in a
test-support module next to the code they support, and the test file imports them.

```
src/orders/
├── order.ts
├── order.test.ts
└── order.test-support.ts     # factories and helpers for order.ts
```

If a test file is mostly setup, extract the setup. The signal is easy to read: scroll
the file and see how much of it is `it(...)` bodies making assertions.

A library that defines a shape other code has to construct should export the factory
for it, so consumers never hand-roll the literal. See the `part-factory-test-data`
skill.

## Comment test bodies with Given, When, Then

Use `// Given`, `// When` and `// Then` comments in test bodies. They say why the
lines are there, not what the lines do.

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

`// Given an offer` restates the code and is worth nothing. `// Given an offer that
closed while the customer was on the page` says which case this is and why it
matters.
