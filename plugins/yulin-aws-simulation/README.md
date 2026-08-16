# @kensio/yulin-aws-simulation

A Claude Code skill for testing AWS code with [Yulin](https://yulinsim.dev/) (`@kensio/yulin`), an
AWS simulator that runs in process, in memory, with no network and no AWS account.

Yulin's own docs are the authority on its API. This skill is the usage guidance that is not in the
API: what to reach for, what to avoid, and what to do when the simulator refuses something.

## Install

From the marketplace:

```bash
claude plugin marketplace add KensioSoftware/kensio.ai
claude plugin install yulin-aws-simulation@kensio
```

From npm:

```bash
npm install @kensio/yulin-aws-simulation
```

## What it covers

**Deploy your real synthesized template.** Deploy the JSON CDK produced, with
`deployTemplateFile({ templatePath, stackName })`, so a construct change that breaks the system
breaks the test. Do not hand-roll a wrapper that reads the file and calls `deployTemplate`: the file
path is how Yulin finds the cloud assembly beside it, so a wrapper loses staged CDK assets.
`transform` handles what a simulation cannot resolve, such as an ARN carrying a real account or a
hosted zone ID from a CDK lookup, and `watch` re-applies the file on change for dev servers.

**Intercept real SDK clients with `SimSdk`, never hand-roll stubs.**
`simSdk.intercept(SecretsManagerClient)` makes real clients answer from the simulation, and the code
under test never learns there is a simulator behind it. On a real project, replacing stubs with
interception immediately caught a Secrets Manager name ending in a hyphen and six characters,
ambiguous with the suffix Secrets Manager appends to an ARN and advised against by AWS, which had
already reached production. It caught a wrongly computed Cognito `SECRET_HASH` the stub had happily
accepted.

**Match service errors by `name`, not `instanceof`.** The SDK exports its exception classes, which
invites the wrong check. `instanceof` holds only while exactly one copy of the SDK is in play, so it
passes in production and fails against the simulator. `name` is what the wire carries, and is the
check that is right in both places.

**Expect refusals, and treat them as a feature.** Yulin refuses a property it does not simulate
rather than ignoring it, because silently accepting something that changes real behaviour is worse.
The cost is that one unsupported setting can make a whole stack unsimulatable, so enumerate every
refusal in one pass: strip properties from the synthesized template until it deploys, then raise
them together.

**Raise gaps upstream, and weight false passes far above false refusals.** A simulator that stays
silent about something costs nothing. One that says 200 where production says 403 converts a
deploy-time failure into a production one, which is the opposite of what it is for. Yulin once
authorised a Lambda function URL invocation against `lambda:InvokeFunctionUrl` alone, where
CloudFront origin access control also needs `lambda:InvokeFunction`. The tests passed, the release
went out, and the endpoint 403'd in production.

**Deploy expensive context once per test file.** Vitest gives each file its own worker, so a stack
deployed in `beforeAll` is already isolated between files. Isolation inside the file comes from
randomised names.

**Run the handler as a real simulated Lambda.** Bind an in-process handler to a template function
and its SDK calls are routed into the simulation as the execution role, so a missing permission on
that role fails the test at the point AWS would have failed it.

## Related skills

- [`isolated-testing-style`](https://github.com/KensioSoftware/kensio.ai/tree/main/plugins/isolated-testing-style)
  is the general argument this skill applies to AWS.
- [`part-factory-test-data`](https://github.com/KensioSoftware/kensio.ai/tree/main/plugins/part-factory-test-data)
  builds the objects those tests are made of.

Part of [kensio.ai](https://github.com/KensioSoftware/kensio.ai). Licensed under the Apache License
2.0. See the [LICENSE](https://github.com/KensioSoftware/kensio.ai/blob/main/LICENSE) in the
repository root.
