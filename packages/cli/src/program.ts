import { Command, CommanderError, InvalidArgumentError, Option } from "commander";
import { CliError, EXIT } from "./errors.js";
import { printError } from "./format.js";
import { defaultIo, type Io } from "./io.js";
import { addCommand } from "./commands/add.js";
import { amendCommand } from "./commands/amend.js";
import { escalateCommand } from "./commands/escalate.js";
import { initCommand } from "./commands/init.js";
import { listCommand } from "./commands/list.js";
import { metricsCommand } from "./commands/metrics.js";
import { showCommand } from "./commands/show.js";
import { statusCommand } from "./commands/status.js";
import { verifyCommand } from "./commands/verify.js";

export const VERSION = "0.1.0";

const DESCRIPTION = `the cairn: a registry of proven features.

A stone is one feature; its proof is the deterministic test that proves it.
Stones are never edited — they are amended.`;

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function integer(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidArgumentError("expected a non-negative integer");
  }
  return parsed;
}

/** Options every command shares. */
function common(command: Command): Command {
  return command.option("-C, --dir <path>", "project directory (defaults to the working directory)");
}

/** The content flags `add` and `amend` share. */
function contentOptions(command: Command): Command {
  return command
    .option("-t, --title <title>", "one-line title, in user language")
    .option("-i, --intent <markdown>", "markdown body: why this feature exists")
    .option(
      "-a, --acceptance <criterion>",
      "acceptance criterion in user language (repeatable)",
      collect,
      [],
    )
    .option("-s, --surface <surface>", "free tag naming the surface (checkout, cli, ...)")
    .option("-r, --request <text>", "the verbatim user request (provenance)")
    .option("--attempts <n>", "attempts spent so far (provenance)", integer)
    .option("--tokens <n>", "tokens spent so far (provenance)", integer)
    .option("--proof [path]", "declare a proof path (bare flag = the conventional path)")
    .option("--json", "read a JSON payload from stdin and answer in JSON")
    .option("--force", "create the stone even if the acceptance lint refuses it");
}

export interface BuildOptions {
  io: Io;
  /** Filled with the exit code the command chose. */
  onExit: (code: number) => void;
}

export function buildProgram({ io, onExit }: BuildOptions): Command {
  const program = new Command();

  program
    .name("cairn")
    .description(DESCRIPTION)
    .version(VERSION, "-v, --version")
    .configureOutput({
      writeOut: (str) => io.out(str.replace(/\n$/, "")),
      writeErr: (str) => io.err(str.replace(/\n$/, "")),
      outputError: (str, write) => write(str),
    })
    .showHelpAfterError("(run `cairn --help` for usage)")
    .enablePositionalOptions();

  common(program.command("init"))
    .description("raise an empty cairn: .cairn/{stones,proofs}, config, gitignore")
    .option("--json", "machine-readable output")
    .option("--force", "rewrite cairn.config.ts even if it exists")
    .action(async (options) => {
      onExit(await initCommand(io, options));
    });

  contentOptions(common(program.command("add")))
    .description("raise a new draft stone")
    .option("--id <ulid>", "use this id instead of generating one")
    .action(async (options) => {
      onExit(await addCommand(io, options));
    });

  common(program.command("list"))
    .description("list the stones in the cairn")
    .option("--status <status>", "only stones with this status")
    .option("--surface <surface>", "only stones on this surface")
    .option("--all", "include retired stones")
    .option("--long", "print full ULIDs")
    .option("--json", "machine-readable output")
    .action(async (options) => {
      onExit(await listCommand(io, options));
    });

  common(program.command("show"))
    .description("everything about one stone, including its lineage")
    .argument("<id>", "stone id (ULID)")
    .option("--json", "machine-readable output")
    .action(async (id, options) => {
      onExit(await showCommand(io, id, options));
    });

  common(program.command("verify"))
    .description("run the proofs and fold the results back into the stones")
    .argument("[id...]", "stones to verify (default: every active stone)")
    .option("--all", "verify every active stone (the default)")
    .option("--proven-only", "only stones that are already proven (CI ratchet)")
    .option("--integrity", "also compare recorded proof hashes with the proofs on disk")
    .option("--no-run", "skip the runner (pairs with --integrity for a pure audit)")
    .addOption(
      new Option("--runner <command>", "command that runs the proofs").env("CAIRN_PLAYWRIGHT_CMD"),
    )
    .option("--dry-run", "report without writing anything back")
    .option("--verbose", "stream the runner output")
    .option("--json", "machine-readable output")
    .action(async (ids: string[], options: Record<string, unknown>) => {
      // commander turns `--no-run` into `run: false`; the command reads noRun.
      onExit(await verifyCommand(io, ids, { ...options, noRun: options.run === false }));
    });

  contentOptions(common(program.command("amend")))
    .description("supersede a stone: new draft, old one retired, lineage recorded")
    .argument("<id>", "stone to amend")
    .option("--id <ulid>", "use this id for the new stone instead of generating one")
    .option("--carry-proof", "copy the old proof over to the new stone")
    .action(async (id, options) => {
      onExit(await amendCommand(io, id, options));
    });

  common(program.command("escalate"))
    .description("hand a draft or broken stone back to a human (budget exhausted)")
    .argument("<id>", "stone id (ULID)")
    .option("--attempts <n>", "attempts spent before giving up", integer)
    .option("--tokens <n>", "tokens spent before giving up", integer)
    .option("--json", "machine-readable output")
    .action(async (id, options) => {
      onExit(await escalateCommand(io, id, options));
    });

  common(program.command("status"))
    .description("synthesis: counts, drafts awaiting proof, broken and escalated stones")
    .option("--json", "machine-readable output")
    .action(async (options) => {
      onExit(await statusCommand(io, options));
    });

  common(program.command("metrics"))
    .description("what the loop costs: attempts, tokens, flakiness, read off .cairn/runs/")
    .option("--json", "machine-readable output")
    .action(async (options) => {
      onExit(await metricsCommand(io, options));
    });

  return program;
}

/**
 * Run the CLI and return an exit code. Never calls process.exit, so tests can
 * drive it in-process; `bin.ts` is the only place that touches the process.
 */
export async function run(argv: string[], io: Io = defaultIo()): Promise<number> {
  let code: number = EXIT.OK;
  const program = buildProgram({ io, onExit: (value) => (code = value) });
  program.exitOverride();
  for (const command of program.commands) command.exitOverride();

  try {
    await program.parseAsync(argv, { from: "user" });
    return code;
  } catch (error) {
    if (error instanceof CommanderError) {
      // help / version are a success; anything else is a usage error.
      if (error.code === "commander.helpDisplayed" || error.code === "commander.help") return EXIT.OK;
      if (error.code === "commander.version") return EXIT.OK;
      return error.exitCode === 0 ? EXIT.OK : EXIT.REFUSED;
    }
    if (error instanceof CliError) {
      printError(io, error.message, error.details);
      return error.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    printError(io, message, error instanceof Error && error.stack ? [] : []);
    if (process.env.CAIRN_DEBUG && error instanceof Error && error.stack) io.err(error.stack);
    return EXIT.FAILURE;
  }
}
