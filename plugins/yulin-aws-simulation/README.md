# @kensio/yulin-aws-simulation

An agent skill for testing AWS code with [Yulin](https://yulinsim.dev/) (`@kensio/yulin`), an AWS
simulator that runs in process, in memory, with no network and no AWS account.

Yulin's own docs are the authority on its API. This skill is the usage guidance missing from the
API: what to reach for, what to avoid, and what to do when the simulator refuses something.

## Install

Into any agent that reads `SKILL.md`:

```bash
npx @kensio/skills add yulin-aws-simulation
```

That copies the skill directory into `.agents/skills/`, where Codex, Cursor, Copilot, Gemini CLI and
the other implementations of the specification look for one. Pass `--agent claude` for
`.claude/skills/`, `--agent copilot` for `.github/skills/`, and `--user` to install it for every
project at once.

Claude Code also takes it as a plugin:

```bash
claude plugin marketplace add KensioSoftware/kensio.ai
claude plugin install yulin-aws-simulation@kensio
```

Or pin it in a repository as a dependency:

```bash
npm install @kensio/yulin-aws-simulation
```

Every skill is also published as a zip on each
[release](https://github.com/KensioSoftware/kensio.ai/releases), for a machine with no npm reach.
Unzip it into `.agents/skills/` and it is installed.

## What it covers

**Deploy your real synthesized template.** Deploy the JSON CDK produced, with
`deployTemplateFile({ templatePath, stackName })`. A construct change that breaks the system breaks
the test. Do not hand-roll a wrapper that reads the file and calls `deployTemplate`: the file path
is how Yulin finds the cloud assembly beside it. A wrapper loses staged CDK assets. `transform`
handles what a simulation cannot resolve, such as an ARN carrying a real account or a hosted zone ID
from a CDK lookup, and `watch` re-applies the file on change for dev servers. `deployCdkOut` deploys
a whole cloud assembly, each Stack into the region its own environment names.

**Register what the app looks up, deploy what the app creates.** `registerHostedZone`,
`registerCertificate` and `registerUserPool` stand a resource up at an id a CDK app pins as a
literal string across stacks. That suits a resource the app only looks up, such as a zone behind
`HostedZone.fromLookup`. One that a stack in the same app creates wants deploying, because a
registration means configuring it by hand and taking its configuration from somewhere other than the
deployed template.

**Wire the object graph once, in production.** A test that builds the application's own object graph
a second time is the shape to watch for. Ask what it cannot get through an invocation, and expect
the answer to be nothing. Bindings and `invoke` give the execution role, the environment and the
outbound HTTP, the production reader gives the state, and a bound handler's output is recorded into
its log group.

**Intercept real SDK clients with `SimSdk`, never hand-roll stubs.**
`simSdk.intercept(SecretsManagerClient)` makes real clients answer from the simulation, and the code
under test never learns there is a simulator behind it. On a real project, replacing stubs with
interception immediately caught a Secrets Manager name ending in a hyphen and six characters,
ambiguous with the suffix Secrets Manager appends to an ARN and advised against by AWS, which had
already reached production. It caught a wrongly computed Cognito `SECRET_HASH` the stub had happily
accepted.

**Drive requests into the simulation with `SimAwsHttp`.** Reading state back covers the resources.
`http.fetch("https://www.example.test/docs/x")` covers the path through them, with nothing listening
and no port to add. One request resolves the hostname through simulated Route 53, finds the
Distribution its alias records point at, and runs the deployed CloudFront Function at
viewer-request. A template assertion over the same stack passes with every Route 53 record missing.

**Match service errors by `name`.** The SDK exports its exception classes, which invites the wrong
check. `instanceof` holds only while exactly one copy of the SDK is in play. It passes in production
and fails against the simulator. `name` is what the wire carries, and is the check that is right in
both places.

**Expect refusals, and treat them as a feature.** Yulin refuses a property it cannot simulate, and
never quietly ignores one, because silently accepting something that changes real behaviour is
worse. The cost is that one unsupported setting can make a whole stack unsimulatable, so enumerate
every refusal in one pass. Strip properties from the synthesized template until it deploys, then
raise them together.

**Raise gaps upstream, and weight false passes far above false refusals.** A simulator that stays
silent about something costs you little. One that says 200 where production says 403 converts a
deploy-time failure into a production one. That is the opposite of what it is for. Yulin once
authorised a Lambda function URL invocation against `lambda:InvokeFunctionUrl` alone, where
CloudFront origin access control also needs `lambda:InvokeFunction`. The tests passed, the release
went out, and the endpoint 403'd in production.

**Deploy expensive context once per test file.** Vitest gives each file its own worker. A stack
deployed in `beforeAll` is already isolated between files. Isolation inside the file comes from
randomised names.

**Run the handler as a real simulated Lambda.** Bind an in-process handler to a template function
and invoke the function through simulated Lambda. Its SDK calls are then routed into the simulation
as the execution role, and a missing permission on that role fails the test at the point AWS would
have failed it. Calling the bound handler directly skips all of that, and so does reading
`process.env` at module scope.

## Related skills

- [`isolated-testing-style`](https://github.com/KensioSoftware/kensio.ai/tree/main/plugins/isolated-testing-style)
  is the general argument this skill applies to AWS.
- [`part-factory-test-data`](https://github.com/KensioSoftware/kensio.ai/tree/main/plugins/part-factory-test-data)
  builds the objects those tests are made of.

Part of [kensio.ai](https://github.com/KensioSoftware/kensio.ai). Licensed under the Apache License
2.0. See the [LICENSE](https://github.com/KensioSoftware/kensio.ai/blob/main/LICENSE) in the
repository root.
