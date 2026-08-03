/**
 * @cairn/cli — the `cairn` command.
 *
 * Everything is exported so the MCP server and the desktop app can call the
 * same code paths the CLI uses, instead of shelling out and parsing text.
 */

export { run, buildProgram, VERSION, type BuildOptions } from "./program.js";
export { CliError, EXIT, usageError, type ExitCode } from "./errors.js";
export { defaultIo, memoryIo, type Io, type MemoryIo } from "./io.js";

export {
  CAIRN_DIR,
  CONFIG_BASENAME,
  CONFIG_EXTENSIONS,
  FALLBACK_CONFIG,
  fileExists,
  findConfigPath,
  findProjectRoot,
  loadConfigFile,
  loadProject,
  readAllStones,
  readFileOrNull,
  readOneStone,
  requireCairn,
  type LoadProjectOptions,
  type Project,
  type StoneCollection,
} from "./project.js";

export {
  isMissingExecutable,
  runArgv,
  runCommandLine,
  tokenize,
  type RunOptions,
  type RunResult,
} from "./proc.js";

export {
  DEFAULT_RUNNERS,
  RUNNER_ENV,
  emptyReport,
  parsePlaywrightReport,
  resolveRunners,
  runProofs,
  statusForProof,
  type ParsedReport,
  type ProofRunOptions,
  type ProofRunOutcome,
  type SpecStatus,
} from "./playwright.js";

export { currentCommit } from "./git.js";

export {
  lintContent,
  mergeContent,
  promptForContent,
  readJsonPayload,
  resolveContent,
  type ContentFlags,
  type LintOutcome,
  type StoneContent,
} from "./stone-input.js";

export { addCommand, contentToStone, resolveProofField, type AddOptions } from "./commands/add.js";
export { amendCommand, type AmendOptions } from "./commands/amend.js";
export { escalateCommand, type EscalateOptions } from "./commands/escalate.js";
export { initCommand, type InitOptions } from "./commands/init.js";
export {
  filterStones,
  listCommand,
  parseStatusFilter,
  stoneJson,
  type ListOptions,
  type StoneFilter,
} from "./commands/list.js";
export { showCommand, type ShowOptions } from "./commands/show.js";
export { countByStatus, statusCommand, type StatusCounts, type StatusOptions } from "./commands/status.js";
export { selectStones, verifyCommand, type VerifyOptions, type VerifyRow } from "./commands/verify.js";
