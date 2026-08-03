/**
 * @cairn/core — the domain of Cairn.
 *
 * The cairn is the registry in `.cairn/`; a stone is one feature; a proof is
 * the deterministic Playwright test that proves it. Everything else in the
 * monorepo (CLI, MCP server, desktop app) consumes these schemas.
 */

export {
  ACTIVE_STONE_STATUSES,
  DEFAULT_PROOFS_DIR,
  DEFAULT_STONES_DIR,
  STONE_STATUSES,
  cairnConfigSchema,
  formatIssues,
  isoDateSchema,
  lastGreenSchema,
  parseCairnConfig,
  parseStone,
  provenanceSchema,
  safeParseCairnConfig,
  safeParseStone,
  stoneSchema,
  stoneStatusSchema,
  ulidSchema,
  type CairnConfig,
  type CairnConfigInput,
  type LastGreen,
  type Provenance,
  type Stone,
  type StoneInput,
  type StoneStatus,
} from "./schema.js";

export {
  ULID_PATTERN,
  assertUlid,
  isUlid,
  newUlid,
  normalizeUlid,
  ulidTime,
} from "./ulid.js";

export {
  PROOF_FILE_EXTENSION,
  STONE_FILE_EXTENSION,
  StoneFileError,
  defaultProofPath,
  listStones,
  normalizeText,
  parseStoneFile,
  proofFileName,
  readStone,
  readStoneById,
  resolveProofPath,
  serializeStone,
  stoneFileName,
  stonePath,
  toPosixPath,
  writeStone,
  writeStoneToDir,
  type ListStonesOptions,
  type ParsedStoneFile,
  type StoneFile,
} from "./stone-file.js";

export {
  formatViolations,
  isAcceptanceClean,
  lintAcceptance,
  type LintRule,
  type Violation,
} from "./lint.js";

export {
  IllegalTransitionError,
  TRANSITIONS,
  amendChain,
  applyVerifyResult,
  canTransition,
  createAmendment,
  currentStone,
  escalate,
  isActive,
  isTerminal,
  legalTransitions,
  transition,
  type AmendPatch,
  type Amendment,
  type ApplyVerifyOutcome,
  type VerifyMeta,
  type VerifyResult,
} from "./transitions.js";

export {
  checkIntegrity,
  hashProof,
  shortHash,
  withProofHash,
  type IntegrityReport,
  type IntegrityStatus,
} from "./integrity.js";
