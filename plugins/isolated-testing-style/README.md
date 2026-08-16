# @kensio/isolated-testing-style

An opinionated testing style, packaged as a Claude Code skill. Real collaborators
through simulation instead of stubs, isolation from randomised data instead of setup
and teardown, and assertions on behaviour instead of call counts.

Every rule in it comes from a specific failure it would have caught, and the failure
is written down next to the rule.

## Install

From the marketplace:

```bash
claude plugin marketplace add KensioSoftware/kensio.ai
claude plugin install isolated-testing-style@kensio
```

From npm:

```bash
npm install @kensio/isolated-testing-style
```

## What it covers

**Prefer real collaborators through simulation.** A stub asserts that your code
called something. A simulator asserts that it called the service correctly. A stub
answers whatever you told it to answer, so it agrees with your understanding of the
API by construction, and cannot find the case where that understanding is wrong.

**Get isolation from the data, not from setup and teardown.** Randomised values from
faker mean two tests cannot collide, so there is nothing to tear down and no ordering
to depend on. A shared environment built the way production is built is closer to
production than a minimal one rebuilt per test, and it is faster.

**Assert behaviour, not call counts.** To prove a value is cached, delete the
underlying resource and show the cached value survives. To prove a retry, make the
first call fail and the second succeed. Both hold however the code is implemented,
which is what makes refactoring safe.

**Never pin a value computed by the code under test.** Pinning a hash you generated
by running the same function only proves the function is deterministic. It keeps
passing after the function becomes wrong. Pin against an independent authority, or
let a real implementation validate it.

**Put test support beside the code.** Factories and helpers live in a test-support
module next to what they support, so test files hold tests.

**Comment test bodies with Given, When and Then**, saying why the lines are there
rather than restating them.

## The other two skills

This skill is the philosophy. Two Kensio packages are tools that serve it, each with
its own skill:

- [`yulin-aws-simulation`](https://github.com/KensioSoftware/kensio.ai/tree/main/plugins/yulin-aws-simulation) covers
  [`@kensio/yulin`](https://yulinsim.dev/), an in-process AWS simulator, which is how
  the first rule is applied to AWS.
- [`part-factory-test-data`](https://github.com/KensioSoftware/kensio.ai/tree/main/plugins/part-factory-test-data) covers
  [`@kensio/part-factory`](https://partfactory.dev/), which builds the randomised
  objects the second rule depends on.

Part of [kensio.ai](https://github.com/KensioSoftware/kensio.ai). Licensed under
the Apache License 2.0. See the [LICENSE](https://github.com/KensioSoftware/kensio.ai/blob/main/LICENSE)
in the repository root.
