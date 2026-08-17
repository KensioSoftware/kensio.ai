#!/usr/bin/env node
// Sends the prose of one document to Pangram, a commercial AI-text detector, and
// reports which passages read as machine-drafted.
//
//   node pangram-check.mjs post.md
//   node pangram-check.mjs post.md --dry-run        guards and cost, send nothing
//   node pangram-check.mjs post.md --print-prose    exactly what would be sent
//   node pangram-check.mjs post.md --format markdown
//   node pangram-check.mjs --check-key              free, spends no detection call
//
// Only the prose goes out. Frontmatter, code, HTML, shortcodes, tables, headings
// and URLs are removed first, and every reported window carries the source line
// its passage starts on. Results are cached by content hash, so re-running on an
// unchanged document costs nothing.
//
// The API key is read from the environment or a dotenv file, is never printed,
// and is redacted from any error text.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";

const HELP = `usage: pangram-check.mjs [options] <file>

  --dry-run            run the guards, print the cost estimate, send nothing
  --print-prose        print the extracted prose and exit
  --format <f>         text, markdown or json (default: text)
  --windows <n>        how many windows to detail, or "all" (default: 5)
  --min-words <n>      refuse below this many words of prose (default: 300)
  --max-units <n>      refuse when the estimate exceeds n billable units
  --reject-todo        refuse while the file holds TODO markers
  --reject <regex>     refuse when this pattern matches the file (repeatable)
  --skip-quotes        leave blockquoted material out of the prose
  --plain              treat the file as plain text, not markdown
  --model <name>       Pangram model selector
  --list-models        list the model selectors the key allows, then exit
  --check-key          check the key is accepted, then exit
  --refresh            ignore any cached result for this text
  --no-cache           neither read nor write the cache
  --config <path>      use this config file
  --no-config          ignore any .pangram-check.json
  --no-color           plain output on a terminal

Config: .pangram-check.json, found by walking up from the file. Keys are
minWords, maxUnits, rejectTodo, rejectPatterns, skipQuotes, format, windows,
model and cache. Flags win over the file.`;

const CAUTION = [
  "A high score marks a passage worth rereading. It is not a number to drive down.",
  "Editing to move a detector score is a different activity from writing in your own voice.",
  "Pangram reports whether text reads as machine-generated. It has no opinion on whether the writing is any good.",
];

// ---- arguments --------------------------------------------------------------

const argv = process.argv.slice(2);
const VALUED = new Set([
  "--format",
  "--windows",
  "--min-words",
  "--max-units",
  "--reject",
  "--model",
  "--config",
]);

const flags = { reject: [] };
const positional = [];
const camel = (name) => name.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (!arg.startsWith("--")) {
    positional.push(arg);
    continue;
  }
  const [name, inline] = arg.includes("=")
    ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]
    : [arg, null];
  if (VALUED.has(name)) {
    const value = inline ?? argv[++i];
    if (value === undefined) fail(2, `${name} needs a value`);
    if (name === "--reject") flags.reject.push(value);
    else flags[camel(name)] = value;
    continue;
  }
  if (inline !== null) fail(2, `${name} takes no value`);
  flags[camel(name)] = true;
}

function fail(code, message) {
  console.error(`✖ ${message}`);
  process.exit(code);
}

if (flags.help || argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

const BASE = process.env.PANGRAM_API_BASE?.trim() || "https://text.external-api.pangram.com";

// ---- key -------------------------------------------------------------------

const KEY_SOURCES = [
  ["$PANGRAM_API_KEY", () => process.env.PANGRAM_API_KEY?.trim() || null],
  ["$PANGRAM_ENV_FILE", () => fromDotenv(process.env.PANGRAM_ENV_FILE)],
  ["~/.config/pangram/.env", () => fromDotenv(configHome())],
  ["./.env", () => fromDotenv(resolve(process.cwd(), ".env"))],
];

function configHome() {
  const base = process.env.XDG_CONFIG_HOME?.trim() || resolve(homedir(), ".config");
  return resolve(base, "pangram/.env");
}

function fromDotenv(path) {
  if (!path || !existsSync(path)) return null;
  const line = readFileSync(path, "utf8")
    .split("\n")
    .find((l) =>
      l
        .trim()
        .replace(/^export\s+/, "")
        .startsWith("PANGRAM_API_KEY="),
    );
  if (!line) return null;
  const value = line
    .split("=")
    .slice(1)
    .join("=")
    .trim()
    .replace(/^["']|["']$/g, "");
  return value && !/^(replace|your|<)/i.test(value) ? value : null;
}

function readKey() {
  for (const [, read] of KEY_SOURCES) {
    const value = read();
    if (value) return value;
  }
  console.error("✖ No Pangram API key found. Looked in, in order:\n");
  for (const [label] of KEY_SOURCES) console.error(`    ${label}`);
  console.error(`
  Pangram is a paid commercial service. Get a key from https://www.pangram.com
  (dashboard, then API keys), then store it where every repository can reach it:

    mkdir -p ~/.config/pangram
    printf 'PANGRAM_API_KEY=%s\\n' 'the-key' > ~/.config/pangram/.env
    chmod 600 ~/.config/pangram/.env

  Or export PANGRAM_API_KEY in the shell, or point $PANGRAM_ENV_FILE at a
  dotenv file that holds it. Check it with:

    node pangram-check.mjs --check-key
`);
  process.exit(2);
}

// Resolved on the first call and never before it, so --dry-run, --print-prose
// and every guard work on a machine that has no key at all.
let KEY = null;
const key = () => (KEY ??= readKey());
const redact = (text) => (KEY ? String(text).split(KEY).join("[REDACTED]") : String(text));

// ---- http ------------------------------------------------------------------

const STATUS_HELP = {
  400: "Pangram rejected the request as malformed.",
  401: "Pangram rejected the API key. Check it with --check-key.",
  403: "Pangram rejected the API key. Check it with --check-key.",
  402: "The Pangram account is out of credits. Top it up at https://www.pangram.com",
  413: "The text is too large for one request. Split the document.",
  429: "Rate limited by Pangram. Wait and run it again.",
};

async function call(path, init) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "x-api-key": key(), ...(init?.headers ?? {}) },
    });
  } catch (error) {
    throw new Error(`Could not reach ${BASE}: ${redact(error.message)}`);
  }
  const body = await response.text();
  if (!response.ok) {
    const help = STATUS_HELP[response.status] ?? `Pangram returned ${response.status}.`;
    throw new Error(`${help}\n  ${redact(body.slice(0, 300))}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Pangram returned a body that is not JSON: ${redact(body.slice(0, 200))}`);
  }
}

// ---- key check and model list ----------------------------------------------

if (flags.checkKey || flags.listModels) {
  try {
    const models = await call("/models", { method: "GET" });
    const names = Array.isArray(models) ? models : (models.models ?? models.data ?? []);
    console.log("✔ Pangram accepted the API key. No detection call was made.");
    const labels = names.map((m) =>
      typeof m === "string" ? m : (m.name ?? m.id ?? JSON.stringify(m)),
    );
    if (labels.length > 0) console.log(`  Model selectors: ${labels.join(", ")}`);
    process.exit(0);
  } catch (error) {
    const message = redact(error.message);
    if (/\b(404|405)\b/.test(message)) {
      console.log("· This deployment does not serve /models, so the key could not be checked");
      console.log("  without spending a detection call. The key was found and looks well formed.");
      process.exit(0);
    }
    fail(1, message);
  }
}

// ---- config ----------------------------------------------------------------

const target = positional[0];
if (!target) fail(2, `no file given.\n\n${HELP}`);
if (!existsSync(target)) fail(2, `no such file: ${target}`);

const CONFIG_NAME = ".pangram-check.json";
const KNOWN_KEYS = new Set([
  "minWords",
  "maxUnits",
  "rejectTodo",
  "rejectPatterns",
  "skipQuotes",
  "format",
  "windows",
  "model",
  "cache",
]);

function findConfig() {
  if (flags.noConfig) return { path: null, values: {} };
  if (flags.config) {
    if (!existsSync(flags.config)) fail(2, `no such config file: ${flags.config}`);
    return { path: flags.config, values: readConfig(flags.config) };
  }
  let dir = dirname(resolve(target));
  for (;;) {
    const candidate = resolve(dir, CONFIG_NAME);
    if (existsSync(candidate)) return { path: candidate, values: readConfig(candidate) };
    const parent = dirname(dir);
    if (parent === dir) return { path: null, values: {} };
    dir = parent;
  }
}

function readConfig(path) {
  let values;
  try {
    values = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(2, `${path} is not valid JSON: ${error.message}`);
  }
  for (const key of Object.keys(values)) {
    if (!KNOWN_KEYS.has(key)) console.error(`· ${path}: ignoring unknown key "${key}"`);
  }
  return values;
}

const config = findConfig();
const number = (value, name) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) fail(2, `${name} must be a non-negative number`);
  return parsed;
};

const settings = {
  minWords:
    flags.minWords !== undefined
      ? number(flags.minWords, "--min-words")
      : (config.values.minWords ?? 300),
  maxUnits:
    flags.maxUnits !== undefined
      ? number(flags.maxUnits, "--max-units")
      : (config.values.maxUnits ?? null),
  rejectTodo: flags.rejectTodo || config.values.rejectTodo === true,
  rejectPatterns: [...(config.values.rejectPatterns ?? []), ...flags.reject],
  skipQuotes: flags.skipQuotes || config.values.skipQuotes === true,
  format: flags.format ?? config.values.format ?? "text",
  windows: flags.windows ?? String(config.values.windows ?? 5),
  model: flags.model ?? config.values.model ?? null,
  cache: flags.noCache ? false : (config.values.cache ?? true),
};

if (!["text", "markdown", "json"].includes(settings.format)) {
  fail(2, `unknown format "${settings.format}". Use text, markdown or json.`);
}

// TODO markers are the reason this preset exists: a wrapped paragraph is prose
// that has not been written yet, so scoring it spends a paid call on a draft.
if (settings.rejectTodo) settings.rejectPatterns.unshift("(?:<!--\\s*|^\\s*)TODO\\b");

const detail = settings.windows === "all" ? Infinity : number(settings.windows, "--windows");

// ---- prose -----------------------------------------------------------------

const MARKDOWN = /\.(md|markdown|mdx|mdoc)$/i;
const isMarkdown = !flags.plain && MARKDOWN.test(target);
const source = readFileSync(target, "utf8");

const INLINE = [
  [/!\[[^\]]*\]\([^)]*\)/g, ""], // images
  [/!\[[^\]]*\]\[[^\]]*\]/g, ""],
  [/\[([^\]]*)\]\([^)]*\)/g, "$1"], // links keep their text
  [/\[([^\]]*)\]\[[^\]]*\]/g, "$1"],
  [/\{\{[<%][\s\S]*?[%>]\}\}/g, ""], // Hugo shortcodes
  [/\{%[\s\S]*?%\}/g, ""], // Liquid and Jekyll tags
  [/`+([^`]*)`+/g, "$1"], // inline code keeps its words
  [/<[^>\n]+>/g, ""], // HTML, JSX and autolinks
  [/https?:\/\/\S+/g, ""],
  [/\[\^[^\]]*\]/g, ""], // footnote references
  [/\{#[^}]*\}/g, ""], // heading anchors
  [/\*\*([^*]+)\*\*/g, "$1"],
  [/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, "$1"],
  [/~~([^~]+)~~/g, "$1"],
  [/\\([*_`[\]#])/g, "$1"], // escapes
];

function extract(text) {
  const lines = text.split("\n");
  const blocks = [];
  let current = [];

  const flush = () => {
    if (current.length === 0) return;
    const joined = current
      .map((part) => part.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (joined) {
      blocks.push({ text: /[.!?:]$/.test(joined) ? joined : `${joined}.`, line: current[0].line });
    }
    current = [];
  };

  let i = 0;
  if (isMarkdown && (lines[0] === "---" || lines[0] === "+++")) {
    const closer = lines[0];
    for (i = 1; i < lines.length && lines[i].trimEnd() !== closer; i++);
    i++;
  }

  let fence = null;
  let comment = false;
  let excluded = false;
  let inList = false;
  let inIndentedCode = false;
  let prevBlank = true;

  for (; i < lines.length; i++) {
    const raw = lines[i];

    if (/pangram-check:\s*off/.test(raw)) {
      excluded = true;
      flush();
      continue;
    }
    if (/pangram-check:\s*on/.test(raw)) {
      excluded = false;
      continue;
    }

    if (isMarkdown && !comment) {
      if (fence) {
        if (new RegExp(`^ {0,3}\\${fence.char}{${fence.length},}\\s*$`).test(raw)) fence = null;
        continue;
      }
      const opening = /^ {0,3}(`{3,}|~{3,})/.exec(raw);
      if (opening) {
        flush();
        fence = { char: opening[1][0], length: opening[1].length };
        continue;
      }
    }

    let text = raw;
    if (isMarkdown) {
      const kept = [];
      let rest = text;
      for (;;) {
        if (comment) {
          const end = rest.indexOf("-->");
          if (end === -1) break;
          comment = false;
          rest = rest.slice(end + 3);
          continue;
        }
        const start = rest.indexOf("<!--");
        if (start === -1) {
          kept.push(rest);
          break;
        }
        kept.push(rest.slice(0, start));
        comment = true;
        rest = rest.slice(start + 4);
      }
      text = kept.join("");
    }

    if (excluded) {
      flush();
      continue;
    }

    let line = text.trim();

    if (!line) {
      flush();
      inList = false;
      prevBlank = true;
      continue;
    }

    if (isMarkdown) {
      const next = lines[i + 1] ?? "";
      // An indented block runs until the next blank line, which is where the
      // blank branch above clears the flag.
      inIndentedCode = /^ {4,}\S/.test(text) && (inIndentedCode || (prevBlank && !inList));
      const drop =
        /^#{1,6}\s/.test(line) || // ATX heading
        /^ {0,3}=+\s*$/.test(text) || // setext underline
        /^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(text) || // horizontal rule
        /^\|/.test(line) || // table row
        /^\[[^^\]]+\]:\s*\S/.test(line) || // link reference definition
        inIndentedCode ||
        /^ {0,3}(=+|-+)\s*$/.test(next); // this line is a setext heading

      if (drop) {
        flush();
        prevBlank = false;
        continue;
      }

      const item = /^ {0,8}([-*+]|\d+[.)])\s+/.exec(line);
      if (item) {
        flush();
        line = line.slice(item[0].length).replace(/^\[[ xX]\]\s*/, "");
        inList = true;
      }

      if (/^ {0,3}>/.test(line)) {
        if (settings.skipQuotes) {
          flush();
          prevBlank = false;
          continue;
        }
        line = line.replace(/^ {0,3}(>\s?)+/, "");
      }

      line = line.replace(/^\[\^[^\]]+\]:\s*/, ""); // footnote definition
    }

    prevBlank = false;

    for (const [pattern, replacement] of INLINE) line = line.replace(pattern, replacement);
    line = line.replace(/\s+/g, " ").trim();
    if (line) current.push({ text: line, line: i + 1 });
  }

  flush();

  let prose = "";
  const map = [];
  for (const block of blocks) {
    if (prose) prose += " ";
    const start = prose.length;
    prose += block.text;
    map.push({ start, end: prose.length, line: block.line });
  }
  return { prose, map };
}

const { prose, map } = extract(source);
const words = prose ? prose.split(" ").length : 0;
const units = Math.max(1, Math.ceil(words / 1000));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const lineFor = (index) => (map.find((b) => b.end > index) ?? map.at(-1))?.line ?? 1;

if (flags.printProse) {
  process.stdout.write(`${prose}\n`);
  process.exit(0);
}

// ---- guards ----------------------------------------------------------------

const rejections = [];
for (const pattern of settings.rejectPatterns) {
  let regex;
  try {
    regex = new RegExp(pattern, "gm");
  } catch (error) {
    fail(2, `reject pattern ${pattern} is not a valid regular expression: ${error.message}`);
  }
  const lines = [];
  for (const match of source.matchAll(regex)) {
    lines.push(source.slice(0, match.index).split("\n").length);
  }
  if (lines.length > 0) rejections.push({ pattern, lines });
}

if (rejections.length > 0) {
  console.error(`✖ ${target} matches a reject pattern. Nothing was sent.\n`);
  for (const { pattern, lines } of rejections) {
    const shown = lines.slice(0, 8).join(", ");
    const more = lines.length > 8 ? `, and ${lines.length - 8} more` : "";
    console.error(`    ${lines.length} × /${pattern}/  on line ${shown}${more}`);
  }
  console.error(`
  Every run costs money, so the document is checked once it is finished. Clear
  the matches, or drop the pattern for this run${config.path ? " with --no-config." : "."}
`);
  process.exit(1);
}

// Pangram's own documented floor. Below it the API declines to predict, so the
// call is spent for nothing. https://www.pangram.com/blog/why-does-pangram-have-a-minimum-word-count
const PANGRAM_FLOOR = 50;

if (words < PANGRAM_FLOOR) {
  fail(
    1,
    `${target} has ${words} words of prose. Pangram needs ${PANGRAM_FLOOR} to predict, so nothing was sent.`,
  );
}
if (words < settings.minWords) {
  console.error(
    `✖ ${target} has ${words} words of prose, under the ${settings.minWords} word floor. Nothing was sent.`,
  );
  console.error(
    `  Pangram predicts from ${PANGRAM_FLOOR} words up, with less confidence the shorter the text.`,
  );
  console.error(
    `  Lower the floor with --min-words ${Math.max(PANGRAM_FLOOR, words)} to check it anyway.`,
  );
  process.exit(1);
}
if (settings.maxUnits !== null && units > settings.maxUnits) {
  fail(
    1,
    `${target} is ${words} words, an estimated ${plural(units, "billable unit")}, over the --max-units ${settings.maxUnits} ceiling. Nothing was sent.`,
  );
}

// ---- cache -----------------------------------------------------------------

const cacheDir = resolve(
  process.env.XDG_CACHE_HOME?.trim() || resolve(homedir(), ".cache"),
  "pangram-check",
);
const digest = createHash("sha256")
  .update(`${settings.model ?? "default"}\n${prose}`)
  .digest("hex");
const cachePath = resolve(cacheDir, `${digest}.json`);

const readCache = () => {
  if (!settings.cache || flags.refresh || !existsSync(cachePath)) return null;
  try {
    return JSON.parse(readFileSync(cachePath, "utf8"));
  } catch {
    return null;
  }
};

const writeCache = (result) => {
  if (!settings.cache) return;
  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      cachePath,
      JSON.stringify({ savedAt: new Date().toISOString(), result }, null, 2),
    );
  } catch {
    // A cache that cannot be written changes nothing about the result.
  }
};

// ---- run -------------------------------------------------------------------

const name = basename(target);
const context = {
  file: target,
  words,
  units,
  model: settings.model ?? "default",
  config: config.path,
  minWords: settings.minWords,
  patterns: settings.rejectPatterns.length,
};

if (flags.dryRun) {
  report(null, { ...context, dryRun: true, cached: Boolean(readCache()) });
  process.exit(0);
}

const cached = readCache();
let result = cached?.result ?? null;

if (!result) {
  key(); // Resolved before anything is announced, so a missing key reports first.
  if (settings.format === "text") {
    process.stderr.write(
      `  Sending ${words} words to Pangram, an estimated ${plural(units, "billable unit")}…\n`,
    );
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const body = { text: prose, public_dashboard_link: false };
    if (settings.model) body.model = settings.model;
    result = await call("/task", { method: "POST", body: JSON.stringify(body) });

    for (let attempt = 0; result.stage !== "STAGE_SUCCESS" && attempt < 60; attempt++) {
      if (result.stage === "STAGE_FAILED") {
        throw new Error(
          `Pangram reported STAGE_FAILED: ${redact(result.error ?? "no reason given")}`,
        );
      }
      await sleep(attempt === 0 ? 1000 : 2000);
      result = await call(`/task/${result.task_id}`, { method: "GET" });
    }
    if (result.stage !== "STAGE_SUCCESS")
      throw new Error("Pangram did not finish within two minutes.");
  } catch (error) {
    fail(1, redact(error.message));
  }
  writeCache(result);
}

report(result, { ...context, cached: Boolean(cached), savedAt: cached?.savedAt ?? null });

// ---- reporting -------------------------------------------------------------

function windowsOf(result) {
  return [...(result.windows ?? [])].map((w, index) => ({
    index,
    score: w.ai_assistance_score ?? 0,
    label: w.label ?? "unknown",
    confidence: w.confidence ?? "unknown",
    words: w.word_count ?? null,
    humanized: w.is_humanized ? (w.humanizer_score ?? null) : null,
    line: lineFor(w.start_index ?? 0),
    excerpt: (w.text ?? "").replace(/\s+/g, " ").trim(),
  }));
}

function report(result, meta) {
  if (settings.format === "json") return json(result, meta);
  if (settings.format === "markdown") return markdown(result, meta);
  return text(result, meta);
}

function pct(n) {
  return `${Math.round((n ?? 0) * 100)}%`;
}

function json(result, meta) {
  const payload = { ...meta, floor: PANGRAM_FLOOR };
  if (result) {
    payload.headline = result.headline ?? null;
    payload.prediction = result.prediction ?? null;
    payload.prediction_short = result.prediction_short ?? null;
    payload.fractions = {
      ai: result.fraction_ai ?? null,
      ai_assisted: result.fraction_ai_assisted ?? null,
      human: result.fraction_human ?? null,
    };
    payload.segments = {
      ai: result.num_ai_segments ?? null,
      ai_assisted: result.num_ai_assisted_segments ?? null,
      human: result.num_human_segments ?? null,
    };
    payload.version = result.version ?? null;
    payload.windows = windowsOf(result);
  }
  console.log(JSON.stringify(payload, null, 2));
}

function markdown(result, meta) {
  const out = [];
  out.push(`## Pangram check: \`${meta.file}\``);
  out.push("");
  if (!result) {
    out.push(
      `Dry run. ${meta.words} words of prose, an estimated ${plural(meta.units, "billable unit")}. Nothing was sent.`,
    );
    console.log(out.join("\n"));
    return;
  }
  out.push(`**${result.headline ?? "No headline"}.** ${result.prediction ?? ""}`.trim());
  out.push("");
  out.push("| | |");
  out.push("| --- | --- |");
  out.push(`| Prose sent | ${meta.words} words, ${plural(meta.units, "billable unit")} |`);
  out.push(
    `| Fractions | ${pct(result.fraction_ai)} AI, ${pct(result.fraction_ai_assisted)} AI-assisted, ${pct(result.fraction_human)} human |`,
  );
  out.push(
    `| Segments | ${result.num_ai_segments ?? 0} AI, ${result.num_ai_assisted_segments ?? 0} AI-assisted, ${result.num_human_segments ?? 0} human |`,
  );
  out.push(`| Model | ${meta.model} |`);
  out.push(`| Source | ${meta.cached ? `cached result from ${meta.savedAt}` : "live call"} |`);
  out.push("");

  const windows = windowsOf(result).sort((a, b) => b.score - a.score);
  if (windows.length > 0) {
    out.push(`### ${plural(windows.length, "window")}, worst first`);
    out.push("");
    out.push("| Score | Label | Confidence | Words | Humanized | Location |");
    out.push("| ----- | ----- | ---------- | ----- | --------- | -------- |");
    for (const w of windows) {
      out.push(
        `| ${w.score.toFixed(2)} | ${w.label} | ${w.confidence} | ${w.words ?? "?"} | ${w.humanized === null ? "no" : w.humanized.toFixed(2)} | \`${name}:${w.line}\` |`,
      );
    }
    out.push("");
    for (const w of windows.slice(0, detail)) {
      out.push(`**${w.score.toFixed(2)} at \`${name}:${w.line}\`**`);
      out.push("");
      out.push(`> ${w.excerpt.slice(0, 220)}…`);
      out.push("");
    }
  }
  for (const line of CAUTION) out.push(`${line}`);
  console.log(out.join("\n"));
}

function text(result, meta) {
  const colour = process.stdout.isTTY && !process.env.NO_COLOR && !flags.noColor;
  const paint = (code, s) => (colour ? `\u001b[${code}m${s}\u001b[0m` : s);
  const dim = (s) => paint(2, s);
  const bold = (s) => paint(1, s);
  const forScore = (score, s) => paint(score < 0.2 ? 32 : score < 0.6 ? 33 : 31, s);
  const bar = (score) => {
    const filled = Math.max(0, Math.min(10, Math.round(score * 10)));
    return forScore(score, `${"█".repeat(filled)}${dim("░".repeat(10 - filled))}`);
  };

  console.log(bold(meta.file));
  console.log(
    `  ${meta.words} words of prose, an estimated ${plural(meta.units, "billable unit")}.`,
  );
  if (meta.patterns > 0)
    console.log(`  ${plural(meta.patterns, "reject pattern")} matched nothing.`);
  if (meta.config) console.log(dim(`  config: ${meta.config}`));

  if (!result) {
    console.log(
      `  Dry run, so nothing was sent.${meta.cached ? " A cached result for this text exists." : ""}`,
    );
    return;
  }

  console.log("");
  console.log(`  ${bold(result.headline ?? "No headline")}`);
  if (result.prediction) console.log(`  ${result.prediction}`);
  console.log(
    `  ${pct(result.fraction_ai)} AI · ${pct(result.fraction_ai_assisted)} AI-assisted · ${pct(result.fraction_human)} human`,
  );
  console.log(
    dim(
      `  segments: ${result.num_ai_segments ?? 0} AI, ${result.num_ai_assisted_segments ?? 0} AI-assisted, ${result.num_human_segments ?? 0} human`,
    ),
  );
  if (meta.cached) console.log(dim(`  cached result from ${meta.savedAt}, no call was made`));

  const windows = windowsOf(result);
  if (windows.length > 2) {
    const strip = windows
      .map((w) => forScore(w.score, "▁▁▂▃▄▅▆▇█"[Math.round(w.score * 8)] || "▁"))
      .join("");
    console.log("");
    console.log(`  reading order  ${strip}  ${dim("one cell per window, start to end")}`);
  }

  const worst = [...windows].sort((a, b) => b.score - a.score);
  if (worst.length > 0) {
    const shown = worst.slice(0, detail);
    console.log("");
    const heading =
      shown.length === windows.length
        ? `${plural(windows.length, "window")}, worst first:`
        : `${plural(windows.length, "window")}, worst ${shown.length} first:`;
    console.log(`  ${heading}`);
    console.log("");
    for (const w of shown) {
      const flag = w.humanized === null ? "" : paint(35, `  humanized ${w.humanized.toFixed(2)}`);
      console.log(
        `  ${bar(w.score)} ${forScore(w.score, w.score.toFixed(2))}  ${w.label}, ${w.confidence} confidence  ${dim(`${name}:${w.line}`)}${flag}`,
      );
      console.log(dim(`     "${w.excerpt.slice(0, 150)}…"`));
      console.log("");
    }
  }

  for (const line of CAUTION.slice(0, 2)) console.log(dim(`  ${line}`));
}
