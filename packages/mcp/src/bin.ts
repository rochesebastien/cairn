#!/usr/bin/env node
/**
 * `cairn-mcp` — serve one project's cairn over MCP, on stdio.
 *
 * Register it with Claude Code:
 *   claude mcp add cairn -- npx @usecairn/mcp --dir /path/to/project
 *
 * stdout belongs to the protocol: everything this file says goes to stderr.
 */

import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startStdioServer, VERSION } from "./server.js";

const USAGE = `cairn-mcp — the Cairn feature registry, over MCP (stdio)

Usage:
  cairn-mcp [--dir <project>]

Options:
  -d, --dir <path>   Project whose cairn is served. Defaults to CAIRN_DIR, then the cwd.
  -h, --help         Show this help.
  -v, --version      Print the version.

Environment:
  CAIRN_DIR          Same as --dir, used when the flag is absent.
`;

export interface ParsedArgs {
  dir?: string;
  help?: boolean;
  version?: boolean;
}

/** Minimal flag parsing: this binary takes one option and must not pull in a CLI framework. */
export function parseArgs(argv: readonly string[], env: NodeJS.ProcessEnv = {}): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--version" || arg === "-v") parsed.version = true;
    else if (arg === "--dir" || arg === "-d") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) throw new Error(`${arg} needs a path`);
      parsed.dir = value;
      index += 1;
    } else if (arg.startsWith("--dir=")) {
      parsed.dir = arg.slice("--dir=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (parsed.dir === undefined && env.CAIRN_DIR) parsed.dir = env.CAIRN_DIR;
  return parsed;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv, process.env);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n\n${USAGE}`);
    return 2;
  }

  if (args.help) {
    process.stderr.write(USAGE);
    return 0;
  }
  if (args.version) {
    process.stderr.write(`${VERSION}\n`);
    return 0;
  }

  const dir = path.resolve(args.dir ?? process.cwd());
  await startStdioServer({ dir });
  process.stderr.write(`cairn-mcp ${VERSION} serving ${dir}\n`);
  return 0;
}

/**
 * True when this file is the process entry point. The real path is compared,
 * so the `cairn-mcp` bin symlink npm creates still counts — and importing this
 * module from a test never starts a server.
 */
function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  main().then(
    (code) => {
      // A served stdio session keeps the event loop alive; help/version do not.
      if (code !== 0) process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`cairn-mcp failed to start: ${(error as Error)?.message ?? error}\n`);
      process.exitCode = 1;
    },
  );
}
