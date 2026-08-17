---
name: yulin-aws-simulation
description: Use the @kensio/yulin in-process AWS simulator well when testing AWS code, using it directly rather than building a harness around it, driving tests, local dev and production from one synthesized CDK template, intercepting SDK clients with SimSdk, controlling simulated time, matching service errors by name, and handling properties Yulin refuses to simulate. Use when writing or reviewing tests that touch AWS, when replacing aws-sdk-client-mock or hand-rolled AWS stubs, when a CDK stack needs testing, when test setup around Yulin is growing helper classes or wrapper functions, and when Yulin refuses a template property or an SDK command.
license: Apache-2.0
metadata:
  version: "1.13.1"
---

# Testing with Yulin

[Yulin](https://yulinsim.dev/) (`@kensio/yulin`) simulates AWS in process, in memory, with no
network and no AWS account. Its own docs are the authority on the API. This skill covers how to use
it well, and that lives mostly outside the API.

Read the package docs for anything API-shaped. Start with
[the README](https://github.com/KensioSoftware/yulin#readme), then `docs/sdk/` for interception and
`docs/services/<name>/` for each simulated service.

This skill serves the `isolated-testing-style` skill, the general argument for simulation over
stubs.

Yulin is deliberately flexible, and plenty of shapes work. What follows is the recommended way to
get the most out of it, offered as guidance. Each one says what it buys. A situation that does not
want that trade can go the other way knowingly.

## Use what Yulin already gives you

The most common way to go wrong with Yulin is to build something on top of it. The failure looks
like a `TestAwsEnvironment` class, a `setupSimulatedAws()` helper returning six things, a factory
per service, or a `beforeEach` that reassembles the world (a private framework wrapped around a tool
that is already the framework).

It is worth resisting, because Yulin is built to be used directly:

- `new SimAws()` and `new SimSdk()` are plain constructors. No side effects, no network, no cleanup
  and no awaiting. Creating a simulation per test is close to free.
- Service accessors take the same Command objects the AWS SDK does, so seeding and asserting need no
  translation layer of their own.
- `using simSdk = new SimSdk()` is the teardown.
- `deployTemplateFile` is the environment.

So the recommended shape of a test is to construct, deploy if a template is involved, intercept,
exercise, then assert by reading the simulation back. A wrapper around any of those steps hides the
one thing a reader of the test needs to see, and it has to be maintained forever after.

If a sequence genuinely repeats, make it a small function in the same test file, and keep it
returning the simulation objects themselves. A bespoke return shape starts hiding them. The point at
which it wants a class, an options interface, or a directory, it has stopped being test setup and
become a second product.

## One synthesized template, for tests, local dev and production

Describe the infrastructure once, in CDK, and let the same synthesized output drive all three.
Production deploys it. The local dev server deploys it. The tests deploy it:

```typescript
const stack = await simAws.region("eu-west-2").cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/SiteStack.template.json",
  stackName: "site-stack",
});

await stack.waitForDeployComplete();
```

A test written against a template you wrote by hand only tests the template you wrote by hand.
Deploying the synthesized output means a construct change that breaks the system breaks the test.

The same argument extends past the test suite. A dev environment that creates its buckets and tables
by hand is a third description of the infrastructure, drifting away from the other two at its own
pace, and the drift shows up as a bug that reproduces in exactly one of the three places. Pointing
the dev server at `cdk.out` as well removes the whole category. What runs locally is what CI tested
and what production deploys, and `watch` turns a `cdk synth` into a stack update in place.

The corollary is that infrastructure belongs in the CDK app even when only a test needs it. A bucket
conjured in test setup is infrastructure that production does not have.

**Do not hand-roll a wrapper that reads the file and calls `deployTemplate`.** `deployTemplateFile`
already reads it, and it locates the cloud assembly beside the file. The assets manifest and staged
asset directories resolve. A wrapper that reads the JSON itself loses that, and anything needing a
CDK asset, such as a `Custom::CDKBucketDeployment` or a `Code.fromAsset` function, fails with
`No CDK assets manifest is available.`

The two options that make a wrapper unnecessary:

- **`transform`** is given the parsed template and answers with the one to deploy. It runs on the
  deployment and again on every re-read. A wrapper cannot do that. Use it for what a simulation
  genuinely cannot resolve, such as an ARN carrying a real account, or a hosted zone ID that came
  from `HostedZone.fromLookup`.
- **`watch`** re-applies the file when it changes, updating the stack in place. This is for dev
  servers. A `cdk synth` becomes a stack update without restarting the process, and resources the
  change left alone keep what they hold.

```typescript
await simAws.cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/SiteStack.template.json",
  transform: withoutLookedUpHostedZone,
  watch: { onUpdated: () => srv.reload() },
});
```

## Intercept real SDK clients, never hand-roll stubs

`SimSdk` replaces the `send` method of an AWS SDK client class or instance, so real clients answer
from the simulation. The code under test uses the SDK exactly as it does in production and never
learns there is a simulator behind it.

```typescript
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();
simSdk.intercept(SecretsManagerClient); // Every instance, including ones made later.
```

A stub asserts that your code called something. The simulator asserts that it called the service
correctly. On a real project, swapping stubs for interception caught two bugs the same afternoon,
both already in production:

- A Secrets Manager secret whose name ended in a hyphen and six characters, exactly the suffix
  Secrets Manager appends to an ARN. AWS advises against names of that shape because they are
  ambiguous with the ARN form. A stub has no naming rules. It had accepted it happily.
- A Cognito `SECRET_HASH` computed the wrong way. The stub had accepted that too, because a stub is
  never going to verify a signature.

Intercept the class in most cases, since the code under test usually constructs its own clients.
Intercept an instance when only one client should reach the simulation.

Each `SimSdk` owns a `SimAws`, reachable as `simSdk.simAws` for seeding and inspecting state. Pass
an existing one with `new SimSdk({ simAws })` to share.

### Intercept what the code actually sends through

Interception replaces `send` on the thing it is given. It has to be given the client the code under
test actually calls. The wrapper clients are where this bites. A `DynamoDBDocumentClient` built over
a `DynamoDBClient` is what the code sends through. The document client is the one that needs
intercepting.

```typescript
using simSdk = new SimSdk();

const documents = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "eu-west-2" }));
simSdk.intercept(documents); // Not the DynamoDBClient it was built from.
```

Every Command through an intercepted client is routed to the simulation by default. An allow list of
Command classes narrows that, and is worth reaching for only when something else should genuinely
handle the rest.

### Prefer `using` over a teardown step

`SimSdk` and the interception handles it returns are disposable, so `using simSdk = new SimSdk();`
restores every intercepted client at the end of the scope. `simSdk.restoreAll()` and
`interception.restore()` do the same thing by hand.

The recommendation is `using`, because it is teardown that cannot be forgotten or skipped by an
early return, and because it leaves nothing for a later test to inherit if the one before it threw.
Reach for the explicit calls when interception has to stop somewhere other than the end of a scope.

## Freeze the clock and advance it deliberately

Each `SimAws` carries its own clock, independent of the host and of every other simulation in the
process. The recommendation is to start it frozen at a fixed instant and move it only on purpose:

```typescript
const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

// Given a session that has run out while the caller was idle.
await simAws.clock().advanceBy({ minutes: 20 });
```

What this buys is that time-dependent behaviour becomes something a test can assert on in
microseconds rather than something it waits for or gives up on. A good deal of the simulation keys
off that clock: EventBridge rules and Scheduler schedules fire only when time is advanced past them,
DynamoDB items pass their TTL, Secrets Manager deletions come due, `AssumeRole` sessions expire, and
Lambda event source mappings re-poll. Inside a simulated Lambda, `Date.now()` and `new Date()`
report simulated time. A handler's own expiry logic is exercised without a stub in sight.

That last point is worth drawing out. `isolated-testing-style` allows a stub for a clock, on the
grounds that a clock has no rules worth modelling. Against Yulin that exception is unnecessary. The
clock is part of the simulation, and advancing it exercises the real expiry rules of the services
around it rather than only the code's own arithmetic.

`simAws.clock().resume()` switches to tracking the underlying clock, and `simAws.clock().isFrozen`
reports which mode it is in. Running mode suits a local dev server. A test that wants it usually
wants an advance instead.

## Assert by reading the simulation back

The simulation holds real state. The assertion can read it. After exercising the code, ask the
service what happened rather than asking the SDK what it was told:

```typescript
// Then the upload is in the bucket, under the key the handler chose.
const object = await simAws.s3().getObject(new GetObjectCommand({ Bucket: bucket, Key: key }));
```

Service accessors take the same Command objects the SDK does. The seeding and assertion code reads
like the production code between them.

This is where simulation pays off over stubs a second time. A call-count assertion holds only for
today's implementation. A state assertion holds however the handler is rewritten, and it fails if
the call was made in a way the real service would have rejected.

## Match service errors by name

```typescript
// Wrong. Passes in production, fails against the simulator.
if (error instanceof ResourceNotFoundException) { ... }

// Right.
if (error instanceof Error && error.name === "ResourceNotFoundException") { ... }
```

The SDK exports exception classes, which invites the `instanceof` check. It holds only while exactly
one copy of the SDK package is in play. Two copies in the module graph, a bundler, or a simulator
raising its own classes, and it silently stops matching. Yulin's errors carry the service's real
error names and SDK-shaped `$metadata`, but they are not instances of the SDK classes.

This is worth fixing in production code, and working around it in tests hides it. `name` is what the
wire carries. The `name` check is the one that is right in both places. A version skew between two
`@aws-sdk/client-*` packages breaks `instanceof` in production too, just less predictably than the
simulator does.

## Expect refusals, and treat them as a feature

Yulin refuses a property it cannot simulate, and never ignores one. That is the right trade.
silently accepting something that changes real behaviour turns a deploy-time failure into a
production one.

The cost is that one unsupported setting can make a whole stack unsimulatable, and the refusal
arrives one property at a time. When that happens, **enumerate every refusal in one pass**. Strip
properties from the synthesized template until it deploys, keeping a list, then raise them together
upstream.

```typescript
// A throwaway transform used to find the floor. Delete it afterwards.
function stripUntilItDeploys(template: CfnTemplateBodyRecord): CfnTemplateBodyRecord {
  // Remove one refused property, re-run, record the next refusal, repeat.
  // Keep the list. Raise it as one issue.
}
```

Doing this one release at a time means one round trip per property, and you never learn how far away
a working simulation actually is. This is the same rule as not discovering service ceilings one
failed deployment at a time.

Not every gap is a refusal. Several services record a property they cannot model and carry on,
reporting it as an ignored property on the stack and on the resource. Check that report before
trusting a test that depends on the setting.

## Raise gaps upstream, and weight false passes far above false refusals

Fix gaps on [the Yulin repository](https://github.com/KensioSoftware/yulin) at source. A local
workaround has to be maintained in every project that hits the same gap.

When reporting, the asymmetry matters more than the volume:

- A simulator that **stays silent** about something costs you little. The test leaves that behaviour
  uncovered, where it was already.
- A simulator that **says 200 where production says 403** converts a deploy-time failure into a
  production one. That is the opposite of what it is for.

So a false pass deserves far more attention than a false refusal. A real example: Yulin authorised a
Lambda function URL invocation against `lambda:InvokeFunctionUrl` alone. CloudFront origin access
control also needs `lambda:InvokeFunction`. The tests passed, the release went out, and the endpoint
403'd in production. A refusal would have cost an afternoon. The false pass cost an incident.

Report a false pass with what production does and what the simulation did. Report a false refusal
with the property and the template that carries it.

## Deploy expensive context once per test file

Vitest gives each test file its own worker, so module-level state is already isolated between files.
Deploy a stack once for the file and let the tests share it. Isolation inside the file comes from
randomised names. Rebuilding the environment buys nothing.

```typescript
let simAws: SimAws;

beforeAll(async () => {
  // Given the real synthesized stack, deployed once for this file.
  simAws = new SimAws();
  const stack = await simAws.cloudFormation().deployTemplateFile({
    templatePath: "cdk.out/SiteStack.template.json",
  });
  await stack.waitForDeployComplete();
});

it("stores an upload", async () => {
  // Given a key no other test in this file is using.
  const key = `uploads/${faker.string.uuid()}.png`;
  // ...
});
```

Putting a template deployment in `beforeEach` pays for the whole stack once per test for no
isolation you did not already have.

A template deployment is the only thing usually worth hoisting. Everything else (the `SimSdk`, a
seeded row, a bucket key) is cheap enough to build inside the test that needs it, and it is also
where it is easiest to read. A `beforeEach` that assembles state for tests that do not all want the
same state is the beginning of the harness this skill opens by arguing against.

## Run the handler as a real simulated Lambda

Yulin can run an in-process handler as a function inside the simulation, in place of a direct call
from the test. Its SDK calls are routed into the simulation as the execution role. The IAM policies
in the template are exercised too.

Bind a handler to a template function at deploy time with `bindings`:

```typescript
await simAws.cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/ApiStack.template.json",
  bindings: [{ logicalId: "UploadFunction", handler: uploadHandler }],
});
```

The handler still runs in process. It can close over test state and be stepped through in a
debugger. The difference from calling it directly is that a missing `s3:PutObject` on the execution
role now fails the test, at the point AWS would have failed it. A binding can target a function by
`logicalId`, `functionName`, `arn`, `cdkPath`, or `imageRepository` for a container image function.
