---
name: github-issue-drafting
description: Draft a GitHub issue from a short note or a rough idea, grounding every claim about the code in the repository the issue will be filed against, splitting work that is really two issues, and filing it with `gh` once the user has approved the draft. Use when turning a to-do item, a Slack message, a code TODO, a failing test or a bug report into an issue, when asked to "write up an issue for" something, to "raise", "file" or "open an issue", when asked whether something should be one issue or several, and when tidying the titles, types or labels of issues that already exist.
license: Apache-2.0
metadata:
  version: "1.18.1"
---

# GitHub issue drafting

A short note ("fix the retry backoff", "SSM params", "the CLI hangs on empty input") carries enough
for whoever wrote it and too little for anyone else, including the same person in six months. The
job is an issue a reader can act on without asking what was meant, with every claim about the code
checked against the code.

## Process

1. **Get the note.** Use the text passed in as the skill argument. Ask the user for it if none
   arrived. A note can come from anywhere (a to-do app, a chat message, a `TODO` comment, a stack
   trace, a support thread) and the source changes nothing about the drafting.

2. **Work out which repository this belongs to, and how it files issues.** `gh repo view` names the
   repository behind the working directory. Confirm with the user where the working directory is
   ambiguous or where the issue belongs somewhere else. Then read how this project already works:

   - `.github/ISSUE_TEMPLATE/` and `CONTRIBUTING.md`, if present. **A repository's own template wins
     over the structure in this skill.** Fill in that template and follow its wording.
   - `gh issue list --limit 10` and one or two full issues (`gh issue view <n>`) for the house
     register, the section headings in use, and how long a typical issue runs.

3. **Investigate before drafting.** See
   [Ground the draft in the repository](#ground-the-draft-in-the-repository).

4. **Decide whether it is one issue or several.** See
   [One note is often more than one issue](#one-note-is-often-more-than-one-issue).

5. **Draft it**, separating what step 3 confirmed from what remains an assumption.

6. **Present the draft in chat as markdown, and stop.** Filing is the user's call. List any open
   questions under the draft so they can be answered before anything is posted.

7. **File it with `gh` only after the user has explicitly asked.** See
   [Filing the issue](#filing-the-issue).

## Ground the draft in the repository

The failure mode that matters is invention. A feature called missing when it half exists,
architecture nobody built, acceptance criteria assuming decisions nobody has made. A note is too
short to carry that context. The repository has to supply it.

Budget a handful of tool calls for this. A full audit is more than the draft needs.

- **Locate the area.** Grep for the nouns and identifiers in the note. A `README`, an architecture
  doc or the directory layout usually points at the right subtree in one step.
- **Read the code that would change, and its tests.** Half-built is the common case, and it is the
  case that embarrasses the issue.
- **Read what the docs already promise.** A behaviour documented as supported and a behaviour
  actually supported are different facts, and the gap between them is sometimes the issue.
- **Check the history.** `git log --oneline -20` for work in flight, and
  `git log --oneline --all --grep="<keyword>"` for work already done under another name.
- **Search the tracker, including closed issues.** `gh issue list --state all --search "<keyword>"`.
  A near duplicate is usually worth a comment on the existing issue. Say so and let the user pick.
  Where `gh` is missing or unauthenticated, skip this quietly and never claim to have checked.

Carry the unresolved parts forward. Anything step 3 failed to settle belongs in the draft as an
explicit question or a stated assumption, and in chat as something for the user to answer.

## One note is often more than one issue

A note is written in one breath. The work it names frequently spans several pull requests, and filed
whole it becomes one enormous branch that is hard to review and hard to stop halfway.

So before drafting, look for a seam that yields **independently shippable** issues. Seams that
usually work, roughly in build order:

- **A usable surface first, whatever sits on top of it second.** The library function is useful on
  its own. The CLI flag, the config key or the framework integration exposing it reads better as a
  follow-up that links back.
- **A piece blocked on something unbuilt.** Work waiting on another feature is its own issue, with
  the dependency named, and not a caveat buried in this one.
- **A distinct usage mode.** The same capability reached at runtime and at build time is two
  features with two sets of tests.
- **A bug fix and the hardening around it.** Ship the fix. File the class of problem separately.

Three seams produce issues nobody can ship alone. One issue per function or endpoint, implementation
split from its tests, and docs as their own issue. Docs belong with the behaviour they describe.

Two or three issues is the usual answer where a split is warranted. Five is over-slicing, and a
small self-contained note stays one issue. Where a split happens, say so in chat and present the set
together, each one naming its dependency and using **Out of scope** to hand work to the others.

## Drafting rules

- **Keep it short, and shorter than feels right.** Roughly 200 to 350 words of prose plus at most
  one example. Three or four sections at most, and no more than six acceptance criteria. Cut any
  section that fails to help a reader understand, implement, test or evaluate the change.
- **The design discussion in chat is not the issue.** Working a note through produces rejected
  alternatives, trade-offs and cost estimates, and almost none of it belongs in the body. Record the
  decision and one sentence of reason. Where the discussion settled something genuinely surprising,
  one short paragraph earns its place.
- **Never invent behaviour, architecture, supported APIs or acceptance criteria.** Where step 3 left
  something unconfirmed, write it as a question or a stated assumption.
- **Scrub anything private before it goes anywhere public.** Notes and stack traces carry customer
  names, internal hostnames, internal ticket ids, paths with a username in them, tokens and API
  keys. A public issue is publication. Redact by default and ask about anything borderline.
- **Write to the problem, and to the observable behaviour that would fix it.** An issue is not a
  pull request description, and a detailed implementation plan belongs in it only where step 3
  turned up a constraint the implementer would otherwise miss.
- **Prefer one concrete example** (a command, a config snippet, a failing assertion, the exact error
  text) over a paragraph of description.
- **A bug needs the version, the environment, the steps, the expected result and the actual
  result.** Anything absent is a question for the user, and a bug report missing them wastes the
  first reply.
- **Leave the process fields alone.** No assignees, milestones, estimates, or wording implying that
  the issue is approved or scheduled. Type and labels are set at filing time.
- **When in doubt, cut.** Erring long is the more common failure. Somebody re-reading this in six
  months needs the problem, the intended behaviour, and enough grounding to trust both.

### Prose

Load the `technical-prose-style` and `avoid-ai-writing` skills before drafting where they are
installed, and run whatever check they ship over the body. Where neither is available, aim for one
claim per sentence, present tense, no em dashes, no marketing adjectives, and one name kept for one
thing.

## Structure

Use the repository's own issue template where it has one. Otherwise draw from the sections below,
taking only those this particular note needs. Most issues use three or four. **Problem** and
**Desired behaviour** are the two that nearly always earn their place. Reach for **Current
behaviour** where what exists today would surprise a reader, and for **Implementation notes** only
where step 3 turned up a real constraint.

```markdown
# Title

## Problem

The concrete limitation, missing capability or user need.

## Current behaviour

What happens today, grounded in what the repository actually shows. Omit where unknown.

## Desired behaviour

The observable behaviour that should exist once this is implemented.

## Example

A command, config, request or expected result. Include it only where it clarifies something.

## Acceptance criteria

Testable checklist items.

## Out of scope

Related work that should not be assumed to be included.

## Implementation notes

Grounded constraints from the investigation. Omit the section entirely where there are none.
```

For a bug, replace the middle three with **Steps to reproduce**, **Expected result**, **Actual
result** and **Environment** (version, runtime, operating system, anything version-pinned that
matters).

## Titles people can find

Issues get indexed, by GitHub's search and by search engines, and they surface far more readily than
pull requests do. For a public repository the title and the opening paragraph are the whole search
snippet, and they do nearly all the work of getting the issue in front of the person who has the
problem.

- **Write the words a user would type.** Internal shorthand and internal abbreviations describe the
  problem to people who already know it. Spell them out.
- **Keep the term that makes the project distinctive**, even while cutting shorthand around it. The
  two look like the same edit and are opposites. An abbreviation nobody searches for should go. The
  one accurate word separating this project from every other page about the same topic should stay,
  because a title without it competes with the upstream documentation and loses.
- **Front-load.** Search snippets truncate around 60 characters, so anything load-bearing goes
  early.
- **Generic verbs are weak alone.** "add", "support", "fix" are fine where the sentence wants them
  anyway. They differentiate nothing on their own, and forcing one in is where a title starts
  sounding written for a crawler.
- **Keep it subtle.** An issue that reads as search filler makes a project look automated, and costs
  more credibility than the traffic is worth. Aim for a title a developer would have written anyway,
  which happens to use the words someone with this problem would search for.
- **Be honest about the size of the prize.** On a small repository these titles win long-tail
  queries. That makes the work worth doing and never worth distorting a title for.

`SSR hydration bug in the DS button` becomes
`Design system button loses its click handler after server-side rendering`. The second expands the
shorthand nobody searches for, keeps the words that place the problem, and adds nothing that is
untrue of the bug.

On a private repository the audience is the team, and all of this reduces to one rule. Say what the
problem is in plain words.

## Filing the issue

Only once the user has explicitly asked.

Write the body to a file and pass it with `--body-file`, so quoting and backticks survive intact:

```bash
gh issue create --repo <owner>/<repo> --title "<title>" --body-file <path> --label <label>
```

**Do not hard-wrap the body.** This is the one formatting trap. GitHub renders issue and comment
Markdown with the GFM hard-line-break extension, so every newline inside a paragraph becomes a
`<br>`. A repository whose prose style wraps at 80 or 100 columns will produce visibly ragged output
when that habit reaches an issue body. Write each paragraph and each list item as one long line.
Blank lines between blocks still separate paragraphs, and code fences and list structure are
unaffected.

**Labels.** Read `gh label list` and pick from what exists. A label passed to `gh` that the
repository lacks fails the whole command.

**Type,** where the organisation has issue types configured. `--type` takes one of them (`Bug`,
`Feature` and `Task` are the GitHub defaults). Its value is in-repo filtering and a readable issue
list. Where the flag or the type is rejected, drop it and carry on.

**Think before applying `good first issue` or `help wanted`.** GitHub surfaces both in its
contributor-discovery UI, and third-party sites scrape them to list approachable open-source work.
For a project actively recruiting contributors that is the point. For a solo maintainer it invites
drive-by pull requests that cost more to review than they return. `CONTRIBUTING.md` and the existing
issues usually say which kind of project this is. Where it stays unclear, leave both off and mention
it.

**Skip Projects and date fields** unless the user asks for them. They are planning tools with
recurring upkeep and no search benefit. Milestones are the lighter option for grouping.

Where several issues came out of one note, file them in dependency order and put each preceding URL
into the issue that depends on it.

After filing, report the URL and state plainly which type and labels were applied.

## Revisiting existing issues

The same thinking applies to issues that already exist, whether retitling or backfilling a missing
type or label. Closed issues are worth including. They stay indexed, and a closed issue describing a
capability that now exists is often exactly what a searcher wants.

Retitling is cheap and low-risk (the URL survives, GitHub keeps the edit history, nobody gets
notified) and it is still a public edit. Propose the full set in chat and get an explicit go-ahead
before running any `gh issue edit`. A table of current against proposed makes the set easy to scan
and easy to reject one row at a time.

Two things to watch in bulk:

- **A run of near-identical titles is a real cost.** One formula applied across five issues makes
  the list scannable and reads as a deliberate series. A shared long prefix is also the first thing
  a sceptical reader notices. Accept it where the issues genuinely are one series, and vary the
  phrasing on a couple where the run gets long.
- **The bodies are usually the bigger win.** The opening paragraph becomes the search snippet, so a
  retitled issue still opening with internal shorthand has had half the job done. Rewriting the
  first sentence of **Problem** often beats the title edit.
