---
name: yulin-aws-simulation
description: Use the @kensio/yulin in-process AWS simulator well when testing AWS code. Share one simulation and SDK interception layer across tests that leave simulated time alone, and isolate the minority that change the clock. Use Yulin directly, deploy CDK-synthesized templates, bind real handlers, intercept SDK clients, drive HTTP with SimAwsHttp, control time, read generated names, match service errors by name, and handle unsupported properties. Use when writing or reviewing tests that touch AWS, replacing SDK stubs, testing CDK stacks or CloudFront resources, simplifying Yulin test setup, or diagnosing unsupported templates and commands.
license: Apache-2.0
metadata:
  version: "1.18.0"
---

# Testing with Yulin

[Yulin](https://yulinsim.dev/) (`@kensio/yulin`) simulates AWS in process, in memory, with no
network and no AWS account. This skill is how to use it well. It serves `isolated-testing-style`,
the general argument for simulation over stubs. Each rule says what it buys, and a case that does
not want that trade can go the other way knowingly.

Treat Yulin as suite infrastructure, in the same way tests treat an AWS account or a LocalStack
container. Create one simulation, deploy the application once and install SDK interception once in
the Vitest suite setup. Every test talks to that shared environment. Randomised resource names and
identifiers keep tests independent while the simulated AWS state remains alive for the whole suite.
This is the default for tests that leave the simulation clock alone. Put the smaller set of tests
that change simulated time in an isolated group, with their own Yulin setup.

For the API read `node_modules/@kensio/yulin/llms.txt`. It indexes the 45 markdown pages beside it
under `node_modules/@kensio/yulin/docs/`, one per simulated service and per feature guide,
documenting the version installed. Open the page it names for the service in hand and grep it for
the operation or property, since Cognito runs to 210 KB with DynamoDB and Lambda close behind. Where
the package is absent, or predates the 1.20.x that started carrying it,
[yulinsim.dev/llms.txt](https://yulinsim.dev/llms.txt) has the same index for the current release
(drop the `llms.txt` for HTML).

## Use what Yulin already gives you

The most common way to go wrong is to build something on top of it. The failure looks like a
`TestAwsEnvironment` class, a `setupSimulatedAws()` helper returning six things, a factory per
service, or a `beforeEach` that reassembles the world.

Yulin is built to be used directly. `new SimAws()` and `new SimSdk()` are plain constructors with no
side effects, no network, no cleanup and no awaiting. Service accessors take the same Command
objects the SDK does. The suite setup creates these objects once. `deployTemplateFile` is the
environment, and the tests import the shared simulation objects directly.

The setup constructs, deploys and intercepts. A test exercises the application and reads the shared
simulation back. A wrapper around any of those steps hides what the reader needs to see. The setup
can be a small module returning the simulation objects themselves. Once it wants a class, an options
interface or a directory, it has become a second product.

## One CDK app behind the tests, local dev and production

Describe the infrastructure once in CDK and let the synthesized output drive all three. Deploy the
template files `cdk synth` wrote, one of them or all of them, and talk to the simulation the way
production talks to AWS.

```typescript
const stack = await simAws.region("eu-west-2").cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/SiteStack.template.json",
  stackName: "site-stack",
});

await stack.waitForDeployComplete();
```

The test suite deploys this template once during its shared Yulin setup. Individual tests use the
deployed resources and do not deploy their own copies.

A hand-written template only tests itself, and a dev environment building its own buckets is a third
description whose drift shows up as a bug reproducing in one place of the three. Infrastructure
belongs in the CDK app even when only a test needs it.

**Do not hand-roll a wrapper that reads the file and calls `deployTemplate`.** `deployTemplateFile`
locates the cloud assembly beside the file, and that is how staged CDK assets resolve. A wrapper
reading the JSON fails anything needing one (a `Custom::CDKBucketDeployment`, a `Code.fromAsset`
function) with `No CDK assets manifest is available.` Two options make a wrapper unnecessary.

- **`transform`** is given the parsed template and answers with the one to deploy, on the deployment
  and on every re-read. Use it for what a simulation genuinely cannot resolve, such as an ARN
  carrying a real account.
- **`watch`** re-applies the file when it changes, updating the stack in place and leaving untouched
  resources holding what they held. For dev servers, where a `cdk synth` becomes a stack update
  without restarting the process.

```typescript
await simAws.cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/SiteStack.template.json",
  transform: withRealAccountArnsResolved,
  watch: { onUpdated: () => srv.reload() },
});
```

The watched file is the one CDK wrote, and the adaptation re-applies on every read.

`stack.output("SiteBucketName")` answers a resolved Output narrowed to a string, throwing on one the
template never declared. Do not hand-roll that reader. A failed `cdk synth` leaves the previous
template in `cdk.out` with the tests still passing against it, so check the synthesized JSON changed
before concluding anything from a construct change.

### Read a generated name back, never write one out

A Resource whose template leaves its name out is named `<stack name>-<logical ID>-<tail>`, as an
account names one. The tail is twelve lowercase hex characters derived from the other two parts,
standing in for the twelve random ones real CloudFormation appends. Where the two parts overrun the
service's limit, thirteen characters of it go to the tail and its hyphen and the rest is shared
between them (a 64 character limit leaves 25 each). The trimmed stack name is what an IAM policy
scoped by resource prefix matches, and a deploy Role allowed an action on `MyVeryLongStackName-*` is
refused here as an account refuses it.

The same template under the same stack name generates the same name every time. That is the one
property tempting a test to write the name out. Read it back instead, from a `Ref`, from an
`Fn::GetAtt` attribute or from the accessor of the service holding it.
[Names CloudFormation generates](https://yulinsim.dev/services/cloudformation/#names-cloudformation-generates)
covers the tail and the trimming.

An ECS container binding has no way round this. The family CloudFormation generates for an unnamed
task definition ends in a tail only a deployment reveals. Name the task definition Resource with the
`logicalId` binding form.

### Register what the app looks up, deploy what the app creates

A CDK app pinning an identifier as a literal string across stacks raises the question of where the
simulated resource carrying it comes from. Yulin stands one up at a chosen id with
`simAws.route53().registerHostedZone({ id, name })`,
`simAws.acm().registerCertificate({ arn, domainName })`,
`simAws.cognitoIdentityProvider().registerUserPool({ id, name })` and `registerUserPoolClient`.

A registration creates a resource in place of the app creating one. It suits `HostedZone.fromLookup`
or a certificate issued by hand outside the app. A resource some stack in the same app creates wants
deploying instead, since a registration takes its configuration from somewhere other than the
deployed template. Substitute in a `transform` only where a deployed resource cannot be given the id
its template names.

Route 53 needs least of this. An `AWS::Route53::RecordSet` naming a hosted zone id no zone holds
gets one registered under that id as the record is created, taking its name from the records naming
it. Register it yourself only where a test depends on that name.

### Deploy a whole cloud assembly with `deployCdkOut`

`deployCdkOut` deploys the Stacks a `cdk.out` holds, each into the region its own environment names
in the assembly manifest, retiring the per-stack region constants. A Stack synthesized with
`env: { region: "us-east-1" }` lands in simulated us-east-1 wherever the call was made from, and one
without `env` takes the region of the scope it was asked through.

```typescript
const stacks = await simAws.cloudFormation().deployCdkOut({
  directoryPath: "cdk.out",
  stackNames: ["DnsStack", "SiteStack"], // Stack names or CDK artifact IDs.
  stackOptions: {
    SiteStack: {
      bindings: [{ logicalId: "UploadFunction", handler: uploadHandler }],
      transform: (template, deployed) =>
        withSimulatedCertificate(template, deployed.get("DnsStack")?.output("SiteCertificateArn")),
    },
  },
});
```

`stackNames` picks part of an assembly, which most apps need, since most also synthesize a
deployment pipeline. `stackOptions` carries the `bindings`, `parameters` and `transform` that
`deployTemplateFile` takes for one template, keyed the same way. Its transform is handed the Stacks
the same call already deployed, so a Stack consuming a sibling's value stays inside one call. Two
Stacks passing a plain string between them declare no dependency for the manifest to carry, and
their order in `stackNames` is what puts the value there in time.

## Intercept real SDK clients, never hand-roll stubs

`SimSdk` replaces the `send` method of an AWS SDK client class or instance. Real clients then answer
from the simulation, and the code under test uses the SDK exactly as it does in production.

```typescript
const simSdk = new SimSdk({ simAws });
simSdk.intercept(SecretsManagerClient); // Every instance, including ones made later.
```

A stub asserts that your code called something. The simulator asserts that it called the service
correctly. A stub has no naming rules and verifies no signatures. A malformed Secrets Manager name
or a wrongly computed Cognito `SECRET_HASH` passes it and fails in production.

Intercept the class in most cases, since the code under test usually constructs its own clients.
Install that class interception once in the suite setup. A class interception is process-wide (it
shadows `send` on the class prototype) and refuses a second install while the first is live, with
`SimSdkAlreadyInterceptedError`. Repeated interception in `beforeEach` or in each test file is both
unnecessary and an error when those files share a worker. Intercept an instance only when one
specific client should reach Yulin.

Whichever it is, it has to be the client the code actually calls. A `DynamoDBDocumentClient` built
over a `DynamoDBClient` is what the code sends through, and the document client is the one to
intercept. Every Command routes to the simulation by default, and an allow list of Command classes
narrows that where something else should handle the rest.

Keep the suite's `SimSdk` alive for as long as the suite. Worker exit normally removes its
process-wide patches. Call `simSdk.restoreAll()` if the process will continue doing other work.
`using simSdk = new SimSdk()` and `interception.restore()` remain useful for a deliberately
short-lived simulation. Each `SimSdk` owns a `SimAws`, reachable as `simSdk.simAws`, and
`new SimSdk({ simAws })` shares an existing one.

### A fake accepts any request the simulator would refuse

A fake S3 client stubbing `send` with canned `ListObjectsV2` pages, asserted on through the
continuation tokens it recorded, passes for code that built its command without a `Bucket`.
Simulated S3 paginates for real, down to the ETag a real multipart upload produces, and
`configureMaxKeysPerPage` lowers the page size so that a bucket of two objects makes a caller walk a
continuation. The residue is small, and a test reaching for a fake to get an answer the service
never sends should say so in a comment.

## Freeze the clock and advance it deliberately

Each `SimAws` carries its own clock, independent of the host and of every other simulation in the
process. Start it frozen and move it only on purpose:

```typescript
const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

// Given a session that has run out while the caller was idle.
await simAws.clock().advanceBy({ minutes: 20 });
```

Time-dependent behaviour then becomes something a test asserts on in microseconds, and a good deal
of the simulation keys off that clock. EventBridge rules and Scheduler schedules fire only when time
is advanced past them, DynamoDB items pass their TTL, Secrets Manager deletions come due,
`AssumeRole` sessions expire, Lambda event source mappings re-poll, and inside a simulated Lambda
`Date.now()` and `new Date()` report simulated time. The clock stub `isolated-testing-style` allows
is unnecessary here, since advancing this one exercises the real expiry rules of the services around
it as well as the code's own arithmetic.

`simAws.clock().resume()` tracks the underlying clock and `simAws.clock().isFrozen` reports the
mode. Running mode suits a local dev server, and a test usually wants an advance.

### Give clock-changing tests their own simulation

The clock is part of a `SimAws` instance's state. Tests sharing that instance also share its current
time and whether it is frozen or running. One test advancing or resuming the clock therefore changes
the environment underneath every other test in that group. Randomised resource names cannot isolate
this change.

Most tests should use the suite simulation without changing its clock. Put tests that advance the
clock or change its mode in a separate Vitest project or file group. Give each of those tests a
fresh `SimAws`, deployment and interception layer. Each test can then control time without affecting
another test. A small group may share one isolated simulation when its cases deliberately follow the
same timeline.

## Assert by reading the simulation back

The simulation holds real state. After exercising the code, ask the service what happened:

```typescript
// Then the upload is in the bucket, under the key the handler chose.
const object = await simAws.s3().getObject(new GetObjectCommand({ Bucket: bucket, Key: key }));
```

A call-count assertion holds only for today's implementation. A state assertion holds however the
handler is rewritten, and it fails if the call was made in a way the real service would have
rejected. In the shared suite environment, read the resource named by the test's random identifier.
Do not list the whole service and assume no other test has left state there.

The accessors sit on more than one scope. `simAws.region(name)` carries some of the services and
`simAws.region(name).account()` carries all of them (`logs()` among the account-only ones), so look
on the other scope before concluding a service is missing. Each also takes a plain
`{ input: { ... } }` in place of a Command object. An assertion can then read a service back without
adding an `@aws-sdk/client-*` package the production code has no use for.

## Drive requests into the simulation

Reading state back covers the resources. `SimAwsHttp` from `@kensio/yulin/serve` covers the path
through them, by sending a request into the environment with nothing listening. It takes what the
global `fetch` takes and answers with a `Response`:

```typescript
const http = new SimAwsHttp({ simAws });
const response = await http.fetch("https://www.example.test/docs/x?a=1", { redirect: "manual" });

// Then the apex redirect the CloudFront Function performs has been applied.
expect(response.status).toBe(301);
expect(response.headers.get("location")).toBe("https://example.test/docs/x?a=1");
```

A hostname simulated Route 53 answers for is requested by its own name, with no port to add and no
`localUrl(...)` adapting (an `https` URL works with no certificate set up for it). That one request
resolves the hostname, finds the Distribution its alias records point at, and runs the deployed
CloudFront Function at viewer-request. The certificate, the Hosted Zone records, the Distribution's
aliases and the function are covered together, where a template assertion over the same stack passes
with every Route 53 record missing.

Reach for `serveSimAws` when the request comes from outside the process (a browser, `curl`, an SDK
client pointed at a local endpoint). Both go through the same routing and service code, and
`SimAwsHttp` leaves parallel test files no port to collide over. See
[the serving docs](https://yulinsim.dev/serve/) for the API.

## Match service errors by name

```typescript
// Wrong. Passes in production, fails against the simulator.
if (error instanceof ResourceNotFoundException) { ... }

// Right.
if (error instanceof Error && error.name === "ResourceNotFoundException") { ... }
```

The SDK exports exception classes, which invites the `instanceof` check. It holds only while exactly
one copy of the SDK package is in play, and two copies in the module graph, a bundler, or a
simulator raising its own classes all stop it matching silently. Yulin's errors carry the service's
real error names and SDK-shaped `$metadata` without being instances of the SDK classes. Fix it in
production code, where a version skew between two `@aws-sdk/client-*` packages breaks `instanceof`
too. `name` is what the wire carries, and is right in both places.

## Expect refusals, and treat them as a feature

Yulin refuses a property it cannot simulate and never ignores one. Silently accepting something that
changes real behaviour would turn a deploy-time failure into a production one. The cost is that one
unsupported setting can make a whole stack unsimulatable, one property at a time. **Enumerate every
refusal in one pass.** Strip properties in a throwaway `transform` until the template deploys,
keeping the list, then raise them together upstream. Taking them one release at a time is one round
trip per property, and you never learn how far away a working simulation is.

Not every gap is a refusal. Several services record a property they cannot model and carry on,
reporting it as an ignored property on the stack and on the resource. Check that report before
trusting a test that depends on the setting.

## Raise gaps upstream, and weight false passes far above false refusals

Fix gaps on [the Yulin repository](https://github.com/KensioSoftware/yulin) at source. A local
workaround has to be maintained in every project that hits the same gap.

The asymmetry matters more than the volume. A simulator staying silent about something costs little,
leaving that behaviour uncovered where it already was. A simulator saying 200 where production says
403 is the opposite of what it is for. So report a false pass with what production does and what the
simulation did, and a false refusal with the property and the template that carries it. Raise a gap
costing nothing but convenience as well, once it is forcing structural duplication.

A workaround kept while the issue is open wants a comment naming that issue and a revisit when it
closes. Re-read those claims on each upgrade. They are the ones nothing tests.

## Share one simulation across the whole test suite

The recommended lifecycle is one `SimAws`, one deployment and one `SimSdk` interception layer for
the tests that do not change simulated time. This should be most of the test suite. Do this in
Vitest setup. Tests should treat the result as a long-running AWS account or LocalStack container
whose state survives every test and test file.

An in-process simulation needs the test files to share a worker and module cache. Set
`fileParallelism: false` and `isolate: false`, then load one setup module through `setupFiles`:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    fileParallelism: false,
    isolate: false,
    setupFiles: ["./test/yulin.setup.ts"],
  },
});
```

Keep the one-time work in an imported module. Vitest executes a setup file before each test file,
even with isolation disabled, but imported modules stay cached in the shared worker.

```typescript
// test/yulin-suite.ts
const ready = (async () => {
  const simAws = new SimAws();
  const simSdk = new SimSdk({ simAws });

  simSdk.intercept(DynamoDBClient);
  simSdk.intercept(S3Client);

  const stack = await simAws.cloudFormation().deployTemplateFile({
    templatePath: "cdk.out/SiteStack.template.json",
  });
  await stack.waitForDeployComplete();

  return { simAws, simSdk, stack };
})();

export function yulinSuite() {
  return ready;
}
```

```typescript
// test/yulin.setup.ts
import { yulinSuite } from "./yulin-suite";

await yulinSuite();
```

Tests import `yulinSuite()` and work against that same state. Give every test data a random name or
identifier, query by that identifier and never assume a service starts empty. A missing-resource
case uses a new identifier that no test created. A count assertion records the relevant count before
the action when it cannot query by identifier. Tests remain independent without clearing tables,
buckets or queues between them.

```typescript
const { simAws } = await yulinSuite();
const key = `uploads/${faker.string.uuid()}.png`;

// Exercise the application, then read this test's object from shared S3 state.
const object = await simAws.s3().getObject({ input: { Bucket: bucket, Key: key } });
```

Do not put the simulation in Vitest `globalSetup`. That hook runs outside the test workers and can
only pass serializable values into them. `setupFiles` runs in the test worker and can share the live
`SimAws` object through the cached module above.

This shared setup also shares the simulation clock. Keep tests that call `advanceBy`, resume the
clock or otherwise change simulated time out of this group. Put them in a separate Vitest project or
file pattern, such as `*.clock.iso.test.ts`, and give each test an isolated Yulin setup. The split
keeps the common suite setup cheap while allowing the smaller clock-testing group to control time.

Creating Yulin once per test or once per file is supported. Reserve it for a case that deliberately
tests an entire fresh account, an independent clock or incompatible interception. Use the shared
setup by default. A `beforeEach` or file-level `beforeAll` that deploys the application again
usually turns random test data into repeated infrastructure work.

## Bind a handler and run it as a real simulated Lambda

`bindings` is how to run your own code inside the simulation, for an `AWS::CloudFront::Function` as
much as for a Lambda function. Bind an in-process handler at deploy time, targeting a Lambda
function by `logicalId`, `functionName`, `arn`, `cdkPath` or `imageRepository`, and a CloudFront
Function by `logicalId`, `functionName` or `arn`. On a CloudFront Function it is what covers source
`cdk synth` embedded or transformed.

```typescript
await simAws.cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/ApiStack.template.json",
  bindings: [{ logicalId: "UploadFunction", handler: uploadHandler }],
});
```

The handler still runs in process, closing over test state and stopping on a breakpoint. The
difference from calling it directly is that a missing `s3:PutObject` on the execution role now fails
the test, at the point AWS would have failed it.

### Invoke through simulated Lambda

Binding a handler proves nothing about IAM on its own. The execution role, the function's
environment and its outbound HTTP are all applied by the invocation, and the test has to go through
`simAws.lambda().invoke(new InvokeCommand({ FunctionName, Payload }))` to get any of them. A test
holding the same handler reference and calling it directly runs it in the test's own scope, as the
test's own caller, with none of the three.

To check a suite covers the policy, remove an action such as `dynamodb:GetItem` from the role in the
CDK stack and re-synthesize. Invoked cases fail with an `AccessDenied` naming the execution role and
the action. Cases calling the handler directly stay green.

### Wire the object graph once, in production

The costliest shape a Yulin suite grows is a second wiring of the application's own object graph,
built so that a recorder can be injected into it and asserted on. Nothing needs it. `bindings` plus
`invoke` run the real handler under its execution role, state reads back through the production
reader against the deployed table, and accounts and other fixtures come from the simulation's own
accessors. A recording logger was the last reason standing, and from 1.17.1 a bound handler's output
is recorded into its log group, read back at `/aws/lambda/<function name>` through
`FilterLogEvents`.

The console and the process standard streams are bridged for the length of an invocation, as
`process.env` and `Date` are. A logging library building its own `Console` over those streams at
module scope is recorded too, Powertools' `Logger` included, both its JSON log line and its EMF
metric document.

So when a test builds the application's own graph, ask what it cannot get through an invocation.
Expect the answer to be nothing.

### Read the environment inside the handler

A bound handler gets the function's declared environment variables with nothing stubbed.
`SimProcessEnvironment` holds a run's variables in an `AsyncLocalStorage` store and resolves
`process.env` to it for the length of the run, with concurrent runs each seeing their own. What it
cannot reach is a read that already happened. A handler module doing
`const TABLE = process.env.TABLE_NAME` at module scope is evaluated when the test file imports it,
long before any run, and captures the host value.

So read the environment inside the handler body, memoising there where a warm container should build
its clients once. The substituted `Date` works the same way, and a `vi.stubEnv` around a bound
handler is the sign of a handler reading too early. `SimLambdaEnvironmentConflicts` warns about
this, but only where the host value and the declared value differ, and a suite that stubs the right
values stays quiet and never learns.

### Keep the zip path for a case about the artefact

Deploying a Lambda function without `bindings` runs the bundle `cdk synth` produced.
`deployTemplateFile` publishes the cloud assembly's assets into the staging bucket in simulated S3,
and the modules are evaluated as CommonJS in a vm sandbox with its own `process.env`, `Date` and
HTTP clients, where the module-scope problem above never arises. Both paths authorise through the
execution role, and the same policy mutation fails a zip-path test exactly as it fails a bound one.

What that buys is the artefact that deploys, its imports and its bundling included, and a case about
the bundle itself is the case to spend it on. Everywhere else it is the fallback. Every run waits on
the build, a stale `cdk.out` runs yesterday's handler, and the vm runtime loads CommonJS as the real
`nodejs` runtimes do, leaving a `NodejsFunction` synthesized with `format: OutputFormat.ESM` refused
at cold start.

### Outbound HTTP is answered by the simulation

From 1.16.2, a simulated Lambda's `fetch` and its `node:http` and `node:https` are answered by the
simulation for every hostname simulated Route 53 resolves, through the same in-process entry point a
request arriving on localhost uses. A Cognito user pool domain, an HTTP API and a load balancer are
all answered without the test knowing which of them it asked, and everything else reaches the
network as addressed. That is what makes an OAuth authorization code exchange testable, since it
lives only at the pool domain's hosted `/oauth2/token` endpoint with no SDK operation behind it, and
it lets `CognitoJwtVerifier` fetch a simulated pool's JWKS from inside a handler with no cache
primed.
