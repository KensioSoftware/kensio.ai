---
name: yulin-aws-simulation
description: Use the @kensio/yulin in-process AWS simulator well when testing AWS code, covering SDK client interception with SimSdk, deploying real synthesized CloudFormation and CDK templates with deployTemplateFile, matching service errors by name, handling properties Yulin refuses to simulate, and where to put expensive setup. Use when writing or reviewing tests that touch AWS, when replacing aws-sdk-client-mock or hand-rolled AWS stubs, when a CDK stack needs testing, and when Yulin refuses a template property or an SDK command.
---

# Testing with Yulin

[Yulin](https://yulinsim.dev/) (`@kensio/yulin`) simulates AWS in process, in memory, with no
network and no AWS account. Its own docs are the authority on the API. This skill covers how to use
it well, which is mostly not in the API.

Read the package docs for anything API-shaped:
[the README](https://github.com/KensioSoftware/yulin#readme), `docs/sdk/` for interception, and
`docs/services/<name>/` for each simulated service.

This skill serves the `isolated-testing-style` skill, which is the general argument for simulation
over stubs.

## Deploy your real synthesized template

Do not describe your infrastructure a second time in the test. Deploy the template CDK synthesized:

```typescript
const stack = await simAws.region("eu-west-2").cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/SiteStack.template.json",
  stackName: "site-stack",
});

await stack.waitForDeployComplete();
```

A test written against a template you wrote by hand only tests the template you wrote by hand.
Deploying the synthesized output means a construct change that breaks the system breaks the test.

**Do not hand-roll a wrapper that reads the file and calls `deployTemplate`.** `deployTemplateFile`
already reads it, and it locates the cloud assembly beside the file, so the assets manifest and
staged asset directories resolve. A wrapper that reads the JSON itself loses that, and anything
needing a CDK asset, such as a `Custom::CDKBucketDeployment` or a `Code.fromAsset` function, fails
with `No CDK assets manifest is available.`

The two options that make a wrapper unnecessary:

- **`transform`** is given the parsed template and answers with the one to deploy. It runs on the
  deployment and again on every re-read, which is what a wrapper cannot do. Use it for what a
  simulation genuinely cannot resolve: an ARN carrying a real account, or a hosted zone ID that came
  from `HostedZone.fromLookup`.
- **`watch`** re-applies the file when it changes, updating the stack in place. This is for dev
  servers: a `cdk synth` becomes a stack update without restarting the process, and resources the
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

- A Secrets Manager secret whose name ended in a hyphen and six characters, which is exactly the
  suffix Secrets Manager appends to an ARN. AWS advises against names of that shape because they are
  ambiguous with the ARN form. A stub has no naming rules, so it had accepted it happily.
- A Cognito `SECRET_HASH` computed the wrong way. The stub had accepted that too, because a stub is
  never going to verify a signature.

Intercept the class rather than the instance in most cases, since the code under test usually
constructs its own clients. Intercept an instance when only one client should reach the simulation.

Each `SimSdk` owns a `SimAws`, reachable as `simSdk.simAws` for seeding and inspecting state. Pass
an existing one with `new SimSdk({ simAws })` to share.

## Match service errors by name, not instanceof

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

This is worth fixing in production code, not worked around in tests. `name` is what the wire
carries, so the `name` check is the one that is right in both places. A version skew between two
`@aws-sdk/client-*` packages breaks `instanceof` in production too, just less predictably than the
simulator does.

## Expect refusals, and treat them as a feature

Yulin refuses a property it does not simulate rather than ignoring it. That is the right trade:
silently accepting something that changes real behaviour turns a deploy-time failure into a
production one.

The cost is that one unsupported setting can make a whole stack unsimulatable, and the refusal
arrives one property at a time. When that happens, **enumerate every refusal in one pass**. Strip
properties from the synthesized template until it deploys, keeping a list, then raise them together
upstream.

```typescript
// A throwaway transform used to find the floor, not to keep.
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

Fix gaps on [the Yulin repository](https://github.com/KensioSoftware/yulin) rather than working
around them locally. A local workaround has to be maintained in every project that hits the same
gap.

When reporting, the asymmetry matters more than the volume:

- A simulator that **stays silent** about something costs nothing. The test does not cover that
  behaviour, which is where it was already.
- A simulator that **says 200 where production says 403** converts a deploy-time failure into a
  production one, which is the opposite of what it is for.

So a false pass deserves far more attention than a false refusal. A real example: Yulin authorised a
Lambda function URL invocation against `lambda:InvokeFunctionUrl` alone. CloudFront origin access
control also needs `lambda:InvokeFunction`. The tests passed, the release went out, and the endpoint
403'd in production. A refusal would have cost an afternoon. The false pass cost an incident.

Report a false pass with what production does and what the simulation did. Report a false refusal
with the property and the template that carries it.

## Deploy expensive context once per test file

Vitest gives each test file its own worker, so module-level state is already isolated between files.
Deploy a stack once for the file and let the tests share it. Isolation inside the file comes from
randomised names, not from rebuilding the environment.

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

## Run the handler as a real simulated Lambda

Yulin can run an in-process handler as a function in the simulation, rather than calling it
directly. Its SDK calls are routed into the simulation as the execution role, so the IAM policies in
the template are exercised too.

Bind a handler to a template function at deploy time with `bindings`:

```typescript
await simAws.cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/ApiStack.template.json",
  bindings: [{ logicalId: "UploadFunction", handler: uploadHandler }],
});
```

The handler still runs in process, so it can close over test state and be stepped through in a
debugger. The difference from calling it directly is that a missing `s3:PutObject` on the execution
role now fails the test, at the point AWS would have failed it. A binding can target a function by
`logicalId`, `functionName`, `arn`, `cdkPath`, or `imageRepository` for a container image function.
