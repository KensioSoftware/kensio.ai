#!/usr/bin/env node
// Scores markdown prose against the five sentence shapes that separate LLM-written
// technical documentation from human-written technical documentation.
//
// Baselines are the rate in 66,000 words of human technical documentation (Django, Effective
// Go, the Rust Book, the Python docs). Warn is the 90th percentile of those files. Fail is the
// lowest threshold that flags none of them, which still flags every LLM-written file tested.
// See reference/measurements.md.
//
//   node prose-check.mjs docs/                 score every .md under docs/
//   node prose-check.mjs README.md --examples 5
//   node prose-check.mjs docs/ --json
//   node prose-check.mjs docs/ --no-bans      measured patterns only, skip house bans
//
// Exits 1 if any file is over a fail threshold.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const PATTERNS = [
  {
    name: "significance-tail",
    // The comma is the discriminator. Requiring it separates the corpora at 8.1x,
    // against 5.8x without, at the same recall. See reference/measurements.md.
    re: /,\s+so\s+(?:a|an|the|it|that|this|there|nothing|no|tests?|you|we|they)\b/gi,
    baseline: 0.79,
    warn: 1.7,
    fail: 2.3,
    hint: "State the fact and stop. Give the consequence its own sentence only if it is not derivable.",
  },
  {
    name: "contrastive-def",
    re: /\b(?:rather than|instead of)\b/gi,
    baseline: 1.06,
    warn: 2.3,
    fail: 4.0,
    hint: "Say what the thing does. Contrast only to correct a belief the reader is likely to hold.",
  },
  {
    name: "negation-frame",
    re: /\b(?:is not|are not|does not|nothing|neither)\b/gi,
    baseline: 2.04,
    warn: 4.6,
    fail: 5.0,
    hint: "Keep negation where the absence is the fact. Otherwise write the positive statement.",
  },
  {
    name: "appositive-tail",
    re: /, which (?:is|means|makes|gives|lets|keeps|does)\b/gi,
    baseline: 0.59,
    warn: 1.1,
    fail: 1.8,
    hint: "Promote the clause to its own sentence, or delete it.",
  },
  {
    name: "colon-explainer",
    re: /[a-z,] ?: [a-z]/g,
    baseline: 2.05,
    warn: 2.0,
    fail: 3.0,
    hint: "A colon may introduce a list or a definition. It should not join a claim to a restatement.",
  },
  {
    name: "lexical-spread",
    // Distinct words per 100, averaged over the document. Human technical writing
    // names a thing and then keeps naming it that. LLM prose reaches for a synonym,
    // which spreads the vocabulary and makes the reader re-resolve the referent.
    // 15 human documents average 0.628 and none exceeds 0.664. 55 LLM documents
    // average 0.685 and none falls below 0.658. See reference/measurements.md.
    measure: (prose) => {
      const words = prose.toLowerCase().match(/[a-z']+/g) ?? [];
      if (words.length < 100) return null;
      const chunks = [];
      for (let i = 0; i + 100 <= words.length; i += 100) {
        chunks.push(new Set(words.slice(i, i + 100)).size / 100);
      }
      return chunks.reduce((a, b) => a + b, 0) / chunks.length;
    },
    unit: "distinct/100",
    baseline: 0.628,
    warn: 0.655,
    // Advisory, never a failure. Two reasons. It describes a whole document rather
    // than a defect at a point, so there is no line to go and fix. And it is trivially
    // gameable by padding with repeated words, which would make the prose worse while
    // moving the number the right way.
    advisory: true,
    hint: "Use the same term for the same thing. A synonym makes the reader re-resolve the referent.",
  },
  // Banned marks. Any occurrence in prose fails, whatever the rate.
  {
    name: "em-dash",
    re: /—/g,
    baseline: 0.24,
    ban: true,
    hint: "Use a full stop, a comma, or brackets. House rule: none in prose.",
  },
  {
    name: "semicolon",
    re: /;/g,
    baseline: 2.7,
    ban: true,
    hint: "Split the sentence. House rule: none in prose.",
  },
];

let active;
const MIN_WORDS = 200; // below this, rates per 1000 words are too noisy to act on
const MIN_COUNT = 3; // a rate computed from one or two occurrences is noise too

/**
 * Reduce markdown to the prose a human actually reads.
 *
 * Regex patterns need inline code masked, so a colon or a comma inside a code span
 * cannot be mistaken for punctuation in a sentence. The lexical measure needs the
 * opposite: an identifier like `SimAws` is exactly the kind of term that should be
 * repeated, and collapsing every span to one token would hide that.
 */
function toProse(markdown, { keepCode = false } = {}) {
  let text = markdown
    .replace(/^---\n[\s\S]*?\n---\n/, "") // frontmatter
    // Regions a document has deliberately excluded, for quoting prose as an example of
    // what not to write. Applied before code stripping so it can cover anything.
    .replace(/<!--\s*prose-check:off\s*-->[\s\S]*?<!--\s*prose-check:on\s*-->/g, "")
    .replace(/^(?: {0,3})(```|~~~)[\s\S]*?^(?: {0,3})\1[^\n]*$/gm, "") // fenced code
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links keep their text
    .replace(/^\[[^\]]+\]:.*$/gm, "") // reference definitions
    // List typography, not a prose splice: `- **Term** — description`.
    .replace(/^(\s*(?:[-*+]|\d+\.)\s+(?:\*\*[^*\n]+\*\*|\[[^\]\n]+\]|`[^`\n]+`))\s+—/gm, "$1 ")
    .replace(/`([^`\n]*)`/g, keepCode ? "$1" : "CODE") // inline code
    .replace(/<[^>\n]+>/g, "")
    .replace(/https?:\/\/\S+/g, "");

  // Rejoin hard-wrapped lines into blocks first. A block is a paragraph or a single
  // list item, and only a whole block gets a terminator, so wrapped sentences survive.
  const blocks = [];
  let current = [];
  const flush = () => {
    if (current.length) blocks.push(current.join(" "));
    current = [];
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (
      !line ||
      line.startsWith("#") || // headings are not prose
      line.startsWith("|") || // table rows
      /^[-*_]{3,}$/.test(line) // horizontal rules
    ) {
      flush();
      continue;
    }
    if (/^(?:[-*+]|\d+\.)\s+/.test(line)) {
      flush();
      current.push(line.replace(/^(?:[-*+]|\d+\.)\s+/, ""));
      continue;
    }
    current.push(line.replace(/^>\s?/, ""));
  }
  flush();

  return blocks
    .map((block) => (/[.!?:]$/.test(block) ? block : `${block}.`))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentences(prose) {
  return prose
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);
}

function scoreFile(path) {
  const markdown = readFileSync(path, "utf8");
  const prose = toProse(markdown);
  const measurable = toProse(markdown, { keepCode: true });
  const words = prose ? prose.split(" ").length : 0;
  const sents = sentences(prose);

  const results = active.map((pattern) => {
    if (pattern.measure) {
      const value = pattern.measure(measurable);
      let status = "ok";
      if (words < MIN_WORDS || value === null) status = "short";
      else if (!pattern.advisory && value >= pattern.fail) status = "FAIL";
      else if (value >= pattern.warn) status = "warn";
      return { pattern, count: null, rate: value, status, worst: [] };
    }

    const count = [...prose.matchAll(pattern.re)].length;
    const rate = words ? (count / words) * 1000 : 0;
    let status = "ok";
    if (pattern.ban) status = count > 0 ? "FAIL" : "ok";
    else if (words < MIN_WORDS) status = "short";
    else if (count >= MIN_COUNT) {
      if (rate >= pattern.fail) status = "FAIL";
      else if (rate >= pattern.warn) status = "warn";
    }

    const worst = sents
      .map((s) => ({ s, n: [...s.matchAll(pattern.re)].length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n || b.s.length - a.s.length)
      .map((x) => x.s);

    return { pattern, count, rate, status, worst };
  });

  return { path, words, sentences: sents.length, results };
}

function markdownFiles(target) {
  if (statSync(target).isFile()) return target.endsWith(".md") ? [target] : [];
  const found = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    found.push(...markdownFiles(join(target, entry.name)));
  }
  return found.sort();
}

const argv = process.argv.slice(2);
const json = argv.includes("--json");
// House bans are style, not evidence. Skip them to re-check the measured separation.
const noBans = argv.includes("--no-bans");
const exampleFlag = argv.indexOf("--examples");
const maxExamples = exampleFlag === -1 ? 1 : Number(argv[exampleFlag + 1]) || 1;
const exampleValue = exampleFlag === -1 ? -1 : exampleFlag + 1;
const targets = argv.filter((a, i) => !a.startsWith("--") && i !== exampleValue);

if (targets.length === 0) {
  console.error(
    "usage: prose-check.mjs <file-or-directory>... [--examples N] [--json] [--no-bans]",
  );
  process.exit(2);
}

active = noBans ? PATTERNS.filter((p) => !p.ban) : PATTERNS;
const reports = targets.flatMap(markdownFiles).map(scoreFile);

if (json) {
  console.log(
    JSON.stringify(
      reports.map((r) => ({
        path: r.path,
        words: r.words,
        patterns: Object.fromEntries(
          r.results.map((x) => [
            x.pattern.name,
            {
              count: x.count,
              rate: x.rate === null ? null : Number(x.rate.toFixed(3)),
              status: x.status,
            },
          ]),
        ),
      })),
      null,
      2,
    ),
  );
} else {
  const cwd = process.cwd();
  for (const report of reports) {
    const flagged = report.results.filter((r) => r.status === "FAIL" || r.status === "warn");
    const label = relative(cwd, report.path) || report.path;

    if (flagged.length === 0) {
      console.log(`\x1b[32m✔\x1b[0m ${label}  ${report.words} words`);
      continue;
    }

    console.log(`\n${label}  ${report.words} words, ${report.sentences} sentences`);
    for (const { pattern, count, rate, status, worst } of flagged) {
      const colour = status === "FAIL" ? "\x1b[31m" : "\x1b[33m";
      console.log(
        `  ${colour}${status.padEnd(4)}\x1b[0m ${pattern.name.padEnd(18)} ` +
          (pattern.measure
            ? `${rate.toFixed(3).padStart(5)} ${pattern.unit}  (baseline ${pattern.baseline}, `
            : `${rate.toFixed(2).padStart(5)} /1k  (${count}, baseline ${pattern.baseline}, `) +
          (pattern.ban
            ? "banned)"
            : pattern.advisory
              ? `warn ${pattern.warn}, advisory)`
              : `warn ${pattern.warn}, fail ${pattern.fail})`),
      );
      console.log(`       ${pattern.hint}`);
      for (const sentence of worst.slice(0, maxExamples)) {
        const shown = sentence.length > 170 ? `${sentence.slice(0, 167)}...` : sentence;
        console.log(`       \x1b[2m↳ ${shown}\x1b[0m`);
      }
    }
  }

  const failing = reports.filter((r) => r.results.some((x) => x.status === "FAIL"));
  const short = reports.filter((r) => r.words < MIN_WORDS);
  console.log(
    `\n${reports.length} file(s), ${failing.length} over a fail threshold` +
      (short.length ? `, ${short.length} too short to score` : ""),
  );
}

process.exit(reports.some((r) => r.results.some((x) => x.status === "FAIL")) ? 1 : 0);
