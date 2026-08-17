#!/usr/bin/env node
// Copies skill directories out of this package and into an agent's skills
// directory.
//
// The whole of installing a skill is putting a directory somewhere an agent
// looks. Every published skill is bundled here, so this needs no network access
// after npx has fetched the package, and it works the same for an agent that has
// never heard of Claude Code.

import { cp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundledSkills = join(packageRoot, "skills");

/**
 * Where each agent looks for skills.
 *
 * `.agents/skills` is the cross-tool convention and the default here: Codex CLI,
 * VS Code and the other implementations of the specification all read it, so one
 * copy serves whatever the reader has installed. The rest are for a project that
 * wants the skill in the directory its own agent already uses.
 */
const AGENT_DIRECTORIES = {
  agents: { project: ".agents/skills", user: ".agents/skills" },
  claude: { project: ".claude/skills", user: ".claude/skills" },
  codex: { project: ".agents/skills", user: ".agents/skills" },
  copilot: { project: ".github/skills", user: ".copilot/skills" },
  cursor: { project: ".agents/skills", user: ".agents/skills" },
  gemini: { project: ".agents/skills", user: ".agents/skills" },
};

const USAGE = `
kensio-skills — install Kensio agent skills into any agent

  npx @kensio/skills list
  npx @kensio/skills add <skill>... [options]
  npx @kensio/skills add --all [options]

Options
  --to <dir>        install into this directory
  --agent <name>    ${Object.keys(AGENT_DIRECTORIES).join(", ")}  (default: agents)
  --user            install for every project, under your home directory
  --all             install every skill
  --force           overwrite a skill directory that is already there
  --help            this

Examples
  npx @kensio/skills add technical-prose-style
  npx @kensio/skills add isolated-testing-style --agent claude --user
  npx @kensio/skills add --all --to ./my-skills
`;

function parseArguments(argv) {
  const options = {
    command: undefined,
    names: [],
    agent: "agents",
    user: false,
    all: false,
    force: false,
    to: undefined,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    switch (argument) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--user":
        options.user = true;
        break;
      case "--all":
        options.all = true;
        break;
      case "--force":
        options.force = true;
        break;
      case "--to":
        options.to = argv[++i];
        break;
      case "--agent":
        options.agent = argv[++i];
        break;
      default:
        if (argument.startsWith("-")) throw new Error(`Unknown option ${argument}`);
        if (options.command === undefined) options.command = argument;
        else options.names.push(argument);
    }
  }

  return options;
}

async function bundled() {
  const names = (await readdir(bundledSkills, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    names.map(async (name) => ({ name, description: await describe(join(bundledSkills, name)) })),
  );
}

/** The `description` line of a SKILL.md, for the listing. */
async function describe(dir) {
  const source = await readFile(join(dir, "SKILL.md"), "utf8");
  const match = /^description:[ \t]*(.*)$/m.exec(source.split(/^---$/m)[1] ?? "");
  return match ? match[1].trim() : "";
}

function targetDirectory(options) {
  if (options.to) return resolve(options.to);

  const agent = AGENT_DIRECTORIES[options.agent];
  if (!agent) {
    throw new Error(
      `Unknown agent "${options.agent}". Known: ${Object.keys(AGENT_DIRECTORIES).join(", ")}`,
    );
  }

  return options.user ? join(homedir(), agent.user) : resolve(agent.project);
}

async function add(options) {
  const available = await bundled();
  const wanted = options.all ? available.map((skill) => skill.name) : options.names;

  if (wanted.length === 0) {
    throw new Error("Name at least one skill, or pass --all. `list` shows what there is.");
  }

  const unknown = wanted.filter((name) => !available.some((skill) => skill.name === name));
  if (unknown.length > 0) {
    throw new Error(`No such skill: ${unknown.join(", ")}. Run \`list\` to see the names.`);
  }

  const target = targetDirectory(options);
  await mkdir(target, { recursive: true });

  let installed = 0;

  for (const name of wanted) {
    const destination = join(target, name);

    if (existsSync(destination)) {
      if (!options.force) {
        console.log(`↷ ${name} is already in ${target}. Pass --force to replace it.`);
        continue;
      }
      // Replaced rather than merged: a rename upstream would otherwise leave the
      // old reference file behind, and the skill would still link to it.
      await rm(destination, { recursive: true, force: true });
    }

    await cp(join(bundledSkills, name), destination, { recursive: true });
    console.log(`✔ ${name} → ${join(target, name)}`);
    installed += 1;
  }

  if (installed > 0) {
    console.log(
      "\nAn agent loads a skill from its description. Ask for the work and it picks it up.",
    );
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  if (options.help || options.command === undefined || options.command === "help") {
    console.log(USAGE.trim());
    return;
  }

  if (!existsSync(bundledSkills) || !(await stat(bundledSkills)).isDirectory()) {
    throw new Error(
      "This package has no skills in it, which means it was packed without its bundle step.",
    );
  }

  switch (options.command) {
    case "list": {
      for (const skill of await bundled()) {
        const summary =
          skill.description.length > 140
            ? `${skill.description.slice(0, 139)}…`
            : skill.description;
        console.log(`${skill.name}\n  ${summary}\n`);
      }
      return;
    }
    case "add":
      await add(options);
      return;
    default:
      throw new Error(`Unknown command "${options.command}". Try \`list\` or \`add\`.`);
  }
}

try {
  await main();
} catch (error) {
  console.error(`✖ ${error.message}`);
  process.exit(1);
}
