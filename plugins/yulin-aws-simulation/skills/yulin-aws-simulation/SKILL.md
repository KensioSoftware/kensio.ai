---
name: yulin-aws-simulation
description: Use the @kensio/yulin in-process AWS simulator well when testing AWS code, using it directly rather than building a harness around it, driving tests, local dev and production from one synthesized CDK template, deploying a whole cdk.out cloud assembly, intercepting SDK clients with SimSdk, driving HTTP requests into the simulation with SimAwsHttp, controlling simulated time, matching service errors by name, and handling properties Yulin refuses to simulate. Use when writing or reviewing tests that touch AWS, when replacing aws-sdk-client-mock or hand-rolled AWS stubs, when a CDK stack needs testing, when a CloudFront Distribution, its DNS records or its certificate need testing, when test setup around Yulin is growing helper classes or wrapper functions, and when Yulin refuses a template property or an SDK command.
license: Apache-2.0
metadata:
  version: "1.16.0"
---

# Testing with Yulin

[Yulin](https://yulinsim.dev/) (`@kensio/yulin`) simulates AWS in process, in memory, with no
network and no AWS account. This skill is how to use it well. For the API read
[yulinsim.dev/llms.txt](https://yulinsim.dev/llms.txt), one markdown page per guide and per
simulated service (drop the `llms.txt` for HTML, or read `docs/` in the repository). It serves
`isolated-testing-style`, the general argument for simulation over stubs. Each rule says what it
buys, and a case that does not want that trade can go the other way knowingly.

## Use what Yulin already gives you

The most common way to go wrong is to build something on top of it. The failure looks like a
`TestAwsEnvironment` class, a `setupSimulatedAws()` helper returning six things, a factory per
service, or a `beforeEach` that reassembles the world.

Yulin is built to be used directly. `new SimAws()` and `new SimSdk()` are plain constructors with no
side effects, no network, no cleanup and no awaiting. Service accessors take the same Command
objects the SDK does. `using simSdk = new SimSdk()` is the teardown, `deployTemplateFile` is the
environment, and a simulation per test is close to free.

So a test constructs, deploys if a template is involved, intercepts, exercises, then asserts by
reading the simulation back. A wrapper around any of those steps hides the one thing the reader
needs to see. A repeated sequence can be a small function in the same file returning the simulation
objects themselves. Once it wants a class, an options interface or a directory, it has become a
second product.

## One synthesized template, for tests, local dev and production

Describe the infrastructure once in CDK and let the synthesized output drive all three:

```typescript
const stack = await simAws.region("eu-west-2").cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/SiteStack.template.json",
  stackName: "site-stack",
});

await stack.waitForDeployComplete();
```

A test written against a hand-written template only tests the hand-written template, and a dev
environment building its own buckets is a third description whose drift shows up as a bug
reproducing in exactly one of the three places. So infrastructure belongs in the CDK app even when
only a test needs it.

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

Together they retire the derived template file a dev server used to write into `cdk.out` so that it
had something to watch. The watched file is the one CDK wrote, and the adaptation re-applies on
every read.

`stack.output("SiteBucketName")` answers a resolved Output narrowed to a string, throwing on one the
template never declared. Do not hand-roll that reader. And note that a failed `cdk synth` leaves the
previous template in `cdk.out` with the tests still passing against it, so check the synthesized
JSON changed before concluding anything from a construct change.

### Register what the app looks up, deploy what the app creates

A CDK app pinning an identifier as a literal string across stacks raises the question of where the
simulated resource carrying it comes from. Yulin stands one up at a chosen id with
`simAws.route53().registerHostedZone({ id, name })`,
`simAws.acm().registerCertificate({ arn, domainName })`,
`simAws.cognitoIdentityProvider().registerUserPool({ id, name })` and `registerUserPoolClient`.

A registration creates a resource in place of the app creating one, and that is what decides when to
use it. It suits `HostedZone.fromLookup` or a certificate issued by hand outside the app. A resource
some stack in the same app creates wants deploying, since a registration would mean configuring it
by hand and taking its configuration from somewhere other than the deployed template. So register
what the app looks up, deploy what the app creates, and substitute in a `transform` only where a
deployed resource cannot be given the id its template names.

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
the same call has already deployed. A Stack consuming a sibling's value therefore stays inside one
call. Two Stacks passing a plain string between them declare no dependency for the manifest to
carry, and the order they are named in is what puts the value there in time.

## Intercept real SDK clients, never hand-roll stubs

`SimSdk` replaces the `send` method of an AWS SDK client class or instance. Real clients then answer
from the simulation, and the code under test uses the SDK exactly as it does in production.

```typescript
using simSdk = new SimSdk();
simSdk.intercept(SecretsManagerClient); // Every instance, including ones made later.
```

A stub asserts that your code called something. The simulator asserts that it called the service
correctly. A stub has no naming rules and verifies no signatures. A malformed Secrets Manager name
or a wrongly computed Cognito `SECRET_HASH` passes it and fails in production.

Intercept the class in most cases, since the code under test usually constructs its own clients.
Intercept an instance when a single client should reach the simulation, and when a file's cases each
build their own `SimAws`. A class interception is process-wide (it shadows `send` on the class
prototype) and refuses a second install while the first is live, with
`SimSdkAlreadyInterceptedError`. An instance interception goes when the instance does.

Whichever it is, it has to be the client the code actually calls. A `DynamoDBDocumentClient` built
over a `DynamoDBClient` is what the code sends through, and the document client is the one to
intercept. Every Command routes to the simulation by default, and an allow list of Command classes
narrows that where something else should handle the rest.

`SimSdk` and its interception handles are disposable, so `using` restores every intercepted client
at the end of the scope, leaving nothing for a later test to inherit when the one before it threw.
`simSdk.restoreAll()` and `interception.restore()` do it by hand. Each `SimSdk` owns a `SimAws`,
reachable as `simSdk.simAws`, and `new SimSdk({ simAws })` shares an existing one.

### A fake accepts any request the simulator would refuse

A fake S3 client stubbing `send` with canned `ListObjectsV2` pages, asserted on through the
continuation tokens it recorded, passes for code that built its command without a `Bucket`.
Simulated S3 does the pagination for real. `Prefix`, `MaxKeys`, `ContinuationToken` and `StartAfter`
all apply, `IsTruncated` and `NextContinuationToken` come back as the service sends them, and
`configureMaxKeysPerPage` lowers the page size so that a bucket of two objects makes a caller walk a
continuation. Uploading real parts gives the object the real `<md5-of-the-part-md5s>-<count>` ETag.

The residue is small. A couple of answers the service never sends (a truncated page naming no
continuation token) can only come from a fake, and a test reaching for one should say so in a
comment.

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

Time-dependent behaviour then becomes something a test asserts on in microseconds. A good deal of
the simulation keys off that clock. EventBridge rules and Scheduler schedules fire only when time is
advanced past them, DynamoDB items pass their TTL, Secrets Manager deletions come due, `AssumeRole`
sessions expire, Lambda event source mappings re-poll, and inside a simulated Lambda `Date.now()`
and `new Date()` report simulated time. So the clock stub `isolated-testing-style` allows is
unnecessary here, since advancing this one exercises the real expiry rules of the services around it
as well as the code's own arithmetic.

`simAws.clock().resume()` tracks the underlying clock and `simAws.clock().isFrozen` reports the
mode. Running mode suits a local dev server, and a test usually wants an advance.

## Assert by reading the simulation back

The simulation holds real state. After exercising the code, ask the service what happened:

```typescript
// Then the upload is in the bucket, under the key the handler chose.
const object = await simAws.s3().getObject(new GetObjectCommand({ Bucket: bucket, Key: key }));
```

A call-count assertion holds only for today's implementation. A state assertion holds however the
handler is rewritten, and it fails if the call was made in a way the real service would have
rejected.

The accessors sit on more than one scope, with `simAws.region(name)` carrying some of the services
and `simAws.region(name).account()` carrying all of them (`logs()` among the ones only the account
scope has), so look on the other scope before concluding a service is missing. Each also takes a
plain `{ input: { ... } }` in place of a Command object. An assertion can therefore read a service
back without adding an `@aws-sdk/client-*` package the production code has no use for.

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
aliases and the function are covered together. A template assertion over the same stack passes with
every Route 53 record missing.

Reach for `serveSimAws` when the request comes from outside the process, such as a browser, `curl`
or an SDK client pointed at a local endpoint. Both go through the same routing and service code, and
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
one copy of the SDK package is in play. Two copies in the module graph, a bundler, or a simulator
raising its own classes, and it silently stops matching. Yulin's errors carry the service's real
error names and SDK-shaped `$metadata` without being instances of the SDK classes. Fix it in
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
403 turns a deploy-time failure into a production one, the opposite of what it is for. So report a
false pass with what production does and what the simulation did, and a false refusal with the
property and the template that carries it. Raise a gap costing nothing but convenience as well, once
it is forcing structural duplication.

A workaround kept while the issue is open wants a comment naming that issue and a revisit when it
closes. Re-read the claims in your own comments on each upgrade. They are the ones nothing tests.

## Deploy expensive context once per test file

Vitest gives each test file its own worker, so module-level state is already isolated between files.
Deploy a stack once for the file and let the tests share it. Isolation inside the file comes from
randomised names.

```typescript
let simAws: SimAws;

beforeAll(async () => {
  simAws = new SimAws();
  const stack = await simAws.cloudFormation().deployTemplateFile({
    templatePath: "cdk.out/SiteStack.template.json",
  });
  await stack.waitForDeployComplete();
});

it("stores an upload", async () => {
  // Given a key no other test in this file is using.
  const key = `uploads/${faker.string.uuid()}.png`;
});
```

A template deployment is the only thing usually worth hoisting, and in `beforeEach` it pays for the
whole stack once per test for no isolation you did not already have. The `SimSdk`, a seeded row and
a bucket key belong inside the test that needs them. A `beforeEach` assembling state for tests that
do not all want the same state is the beginning of the harness this skill opens by arguing against.

## Run the handler as a real simulated Lambda

Yulin can run an in-process handler as a function inside the simulation. Bind it to a template
function at deploy time with `bindings`, targeting the function by `logicalId`, `functionName`,
`arn`, `cdkPath` or `imageRepository`:

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

The console and the process standard streams are both bridged for the length of an invocation, in
the way `process.env` and `Date` are. A logging library building its own `Console` over those
streams at module scope is recorded too, Powertools' `Logger` included, both its JSON log line and
its EMF metric document.

So when a test builds the application's own graph, ask what it cannot get through an invocation.
Expect the answer to be nothing.

### Read the environment inside the handler

A bound handler gets the function's declared environment variables with nothing stubbed.
`SimProcessEnvironment` holds a run's variables in an `AsyncLocalStorage` store and resolves
`process.env` to it for the length of the run, with concurrent runs each seeing their own. The one
thing it cannot reach is a read that already happened. A handler module doing
`const TABLE = process.env.TABLE_NAME` at module scope is evaluated when the test file imports it,
long before any run, and captures the host value.

So read the environment inside the handler body, memoising there where a warm container should build
its clients once. The substituted `Date` works the same way. A `vi.stubEnv` around a bound handler
is the sign of a handler reading too early. `SimLambdaEnvironmentConflicts` warns about this, but
only where the host value and the declared value differ, and a suite that stubs the right values
stays quiet and never learns.

### What a binding buys, and what the zip path buys

Deploying without `bindings` runs the bundle `cdk synth` produced. `deployTemplateFile` publishes
the cloud assembly's assets into the staging bucket in simulated S3, and the modules are evaluated
as CommonJS in a vm sandbox with its own `process.env`, `Date` and HTTP clients, where the
module-scope problem above never arises. Both paths authorise through the execution role, and the
same policy mutation fails a zip-path test exactly as it fails a bound one.

- **A binding** keeps a breakpoint working and lets the handler close over test state.
- **The zip path** exercises the artefact that deploys, its imports and its bundling included.

### Outbound HTTP is answered by the simulation

From 1.16.2, a simulated Lambda's `fetch` and its `node:http` and `node:https` are answered by the
simulation for every hostname simulated Route 53 resolves, through the same in-process entry point a
request arriving on localhost uses. A Cognito user pool domain, an HTTP API and a load balancer are
all answered without the test knowing which of them it asked, and everything else reaches the
network as it was addressed. This is what makes an OAuth authorization code exchange testable, since
that exchange lives only at the pool domain's hosted `/oauth2/token` endpoint with no SDK operation
behind it. The same routing lets `CognitoJwtVerifier` fetch a simulated pool's JWKS from inside a
handler with no cache primed.
