---
name: hello-world
description: Confirms that a Kensio skill is installed and loading correctly. Use when the user asks to "test the kensio marketplace", "check my skills are working", or says "hello world" in the context of Claude Code plugins.
---

# Hello World

A placeholder skill whose only job is to prove the install path works end to end:
marketplace → plugin → skill → loaded into the session.

## What to do

When this skill is invoked, tell the user:

1. That the `hello-world` skill from the `kensio` marketplace loaded successfully.
2. Which install channel they appear to be using, if it is obvious from the
   conversation (marketplace, npm package, or downloaded archive).
3. That this is an example skill and can be safely uninstalled:

   ```
   /plugin uninstall hello-world@kensio
   ```

Keep the reply to a couple of sentences. Do not do any other work on the basis of
this skill.
