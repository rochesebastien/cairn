/**
 * @cairn/mcp — the cairn, over the Model Context Protocol.
 *
 * The server exposes @cairn/core through eight tools and three resources. It
 * adds no domain logic: it is the door agents knock on, and the one place the
 * acceptance guard-rail is enforced server-side.
 */

export {
  createCairnServer,
  startStdioServer,
  RESOURCE_URIS,
  SERVER_NAME,
  VERSION,
  type CairnServerOptions,
} from "./server.js";

export {
  acceptanceRefusal,
  amendStoneOp,
  cairnPayload,
  createDraftOp,
  getEscalationsOp,
  getStoneOp,
  lintAcceptanceOp,
  listStonesOp,
  recordRunOp,
  retireStoneOp,
  statusPayload,
  stonePayload,
  type AmendInput,
  type CairnTarget,
  type DraftInput,
  type ListStonesInput,
  type OperationResult,
  type RecordRunInput,
  type RunMeta,
  type StoneJson,
} from "./operations.js";

export { main, parseArgs, type ParsedArgs } from "./bin.js";
