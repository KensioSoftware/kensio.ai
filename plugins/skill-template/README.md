# @kensio/skill-template

A copy-and-edit starting point for writing an agent skill, covering the directory layout the
[Agent Skills specification](https://agentskills.io/specification) defines, how to word a
description so the skill actually triggers, and how to publish one from this repository.

A skill is a directory holding a `SKILL.md`. Claude Code, Codex, Cursor, Copilot, Gemini CLI and the
other implementations all read that same directory, and the plugin wrapper in this repository is one
way of delivering it.

```bash
npx @kensio/skills add skill-template
```

```
/plugin marketplace add KensioSoftware/kensio.ai
/plugin install skill-template@kensio
```

Part of [kensio.ai](https://github.com/KensioSoftware/kensio.ai). Licensed under the Apache License
2.0. See the [LICENSE](https://github.com/KensioSoftware/kensio.ai/blob/main/LICENSE) in the
repository root.
