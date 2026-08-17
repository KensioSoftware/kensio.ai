# @kensio/part-factory-test-data

An agent skill for building test data with [Part Factory](https://partfactory.dev/)
(`@kensio/part-factory`), a small typed object factory library.

The package README is the authority on the API. This skill covers which factory to reach for, when a
mapped factory earns its place, and where factories should live.

## Install

Into any agent that reads `SKILL.md`:

```bash
npx @kensio/skills add part-factory-test-data
```

That copies the skill directory into `.agents/skills/`, where Codex, Cursor, Copilot, Gemini CLI and
the other implementations of the specification look for one. Pass `--agent claude` for
`.claude/skills/`, `--agent copilot` for `.github/skills/`, and `--user` to install it for every
project at once.

Claude Code also takes it as a plugin:

```bash
claude plugin marketplace add KensioSoftware/kensio.ai
claude plugin install part-factory-test-data@kensio
```

Or pin it in a repository as a dependency:

```bash
npm install @kensio/part-factory-test-data
```

Every skill is also published as a zip on each
[release](https://github.com/KensioSoftware/kensio.ai/releases), for a machine with no npm reach.
Unzip it into `.agents/skills/` and it is installed.

## What it covers

**Which factory to reach for.** `StaticFactory` for fixed defaults. `DynamicFactory` when the
defaults have to be generated fresh, paired with [faker](https://fakerjs.dev/), which is what gives
tests their isolation. `VariantFactory` for a named variation of a base factory, when the variation
is worth a name in the test. `MappedFactory` when the output shape differs from the parts you want
to override.

**When a mapped factory earns its place.** The map should be a real transformation, such as parts to
an encoded form body, or front matter parts to a file as written on disk. If the map is copying
fields across into an object of the same shape, you wanted a `DynamicFactory`.

**Call the factory directly.** `make(overrides)` already is that function, and it does the job
better, since its overrides are partial all the way down the nested structure where a spread
replaces a nested object whole. A wrapper doing more than passing overrides through is a signal that
the factory is the wrong shape, or that the output type is fighting you.

**Factories belong beside the type they construct.** A library defining an event or message shape
should export a factory for it, so consumers never hand-roll the literal. The example the skill
works through is an AWS Lambda function URL invocation event in payload format 2.0: around thirty
lines of which two matter to any test. Hand-writing it in three files gives three copies that drift,
and it carries a trap, because the path is in the event twice, as `rawPath` and as
`requestContext.http.path`. A test that sets one and not the other passes against a handler reading
the field the test set, and fails in production against the same handler reading the other one. A
`MappedFactory` sets it once.

## Related skills

- [`isolated-testing-style`](https://github.com/KensioSoftware/kensio.ai/tree/main/plugins/isolated-testing-style)
  is the general argument for keeping setup out of test bodies, and for taking isolation from
  randomised data.
- [`yulin-aws-simulation`](https://github.com/KensioSoftware/kensio.ai/tree/main/plugins/yulin-aws-simulation)
  covers the AWS simulator those tests run against.

Part of [kensio.ai](https://github.com/KensioSoftware/kensio.ai). Licensed under the Apache License
2.0. See the [LICENSE](https://github.com/KensioSoftware/kensio.ai/blob/main/LICENSE) in the
repository root.
