# Configuration

Every setting has a flag. The ones a repository wants every time belong in a config file.

## Flags

| Flag               | Effect                                                           |
| ------------------ | ---------------------------------------------------------------- |
| `--dry-run`        | Runs the guards, prints the cost estimate, sends nothing         |
| `--print-prose`    | Prints the extracted prose and exits                             |
| `--format <f>`     | `text` (default), `markdown` or `json`                           |
| `--windows <n>`    | How many windows to detail, or `all` (default 5)                 |
| `--min-words <n>`  | Refuses below this many words of prose (default 300)             |
| `--max-units <n>`  | Refuses over this many billable units                            |
| `--reject-todo`    | Refuses while the file holds `TODO` markers                      |
| `--reject <regex>` | Refuses when the pattern matches the file. Repeatable            |
| `--skip-quotes`    | Leaves blockquoted material out of the prose                     |
| `--plain`          | Treats the file as plain text, skipping the markdown rules       |
| `--model <name>`   | Pangram model selector, passed through as `model`                |
| `--list-models`    | Lists the selectors the key allows, then exits                   |
| `--check-key`      | Checks the key is accepted, then exits. Spends no detection call |
| `--refresh`        | Ignores any cached result for this text                          |
| `--no-cache`       | Neither reads nor writes the cache                               |
| `--config <path>`  | Uses this config file                                            |
| `--no-config`      | Ignores any `.pangram-check.json`                                |
| `--no-color`       | Plain output on a terminal                                       |

Exit codes: `0` ran, `1` a guard refused or Pangram failed, `2` a usage, config or key problem.

## The config file

`.pangram-check.json`, found by walking up from the file being checked. The first one found wins,
and flags override it. An unknown key prints a warning and is ignored.

```json
{
  "minWords": 300,
  "maxUnits": 2,
  "rejectTodo": true,
  "rejectPatterns": ["<!--\\s*FIXME", "^\\s*XXX\\b"],
  "skipQuotes": false,
  "format": "markdown",
  "windows": 3,
  "model": "default",
  "cache": true
}
```

Patterns are JavaScript regular expressions, matched against the raw file with the `g` and `m`
flags, so `^` and `$` anchor to a line. Backslashes need escaping for JSON. Every match is reported
with its line number.

`rejectTodo` is the preset behind `--reject-todo`, and matches a `TODO` opening an HTML comment or a
line.

## The API key

Read from the first of these that carries `PANGRAM_API_KEY`, and never printed:

1. `$PANGRAM_API_KEY` in the environment
2. `$PANGRAM_ENV_FILE`, a path to a dotenv file
3. `~/.config/pangram/.env` (or `$XDG_CONFIG_HOME/pangram/.env`)
4. `./.env` in the working directory

The third is the one to recommend. It sits outside any repository and every project on the machine
can reach it.

```bash
mkdir -p ~/.config/pangram
printf 'PANGRAM_API_KEY=%s\n' 'the-key' > ~/.config/pangram/.env
chmod 600 ~/.config/pangram/.env
```

A placeholder value (anything starting `replace`, `your` or `<`) counts as absent. The key is
redacted from any error text the script prints.

`$PANGRAM_API_BASE` overrides the API host. The test stub in this repository uses it.

## What counts as prose

These are removed entirely:

- YAML and TOML frontmatter
- Fenced and indented code blocks
- HTML comments
- Images, tables, headings and horizontal rules
- Link reference definitions
- Hugo shortcodes and Liquid tags
- HTML and JSX tags
- Bare URLs

These keep their words and lose their markup:

- Link text
- Inline code
- Bold and emphasis
- Footnote text
- List item text
- Blockquotes (unless `--skip-quotes`)

Each paragraph and each list item becomes one block. Blocks are joined with a space, and a block
with no terminal punctuation gains a full stop. Without it the detector reads a run of list items as
one sentence.

Regions between `<!-- pangram-check:off -->` and `<!-- pangram-check:on -->` are dropped. Use them
for quoted material.

`.md`, `.markdown`, `.mdx` and `.mdoc` get the markdown rules. Everything else is treated as plain
text, and `--plain` forces that.

Every block records the source line it started on. That is where the `file:line` reference on each
reported window comes from.

## The cache

`$XDG_CACHE_HOME/pangram-check/` or `~/.cache/pangram-check/`, one JSON file per result, keyed by a
SHA-256 of the model selector and the extracted prose. The file holds the full API response,
including the submitted text.

Delete the directory to clear it. `--no-cache` writes nothing there.
