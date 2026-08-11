# @usecairn/mcp

The cairn of a project, served over the [Model Context Protocol](https://modelcontextprotocol.io).

`cairn-mcp` is a stdio MCP server that exposes one target project's registry —
its stones, their acceptance criteria, their proofs — as tools and resources.
It wraps [`@usecairn/core`](../core) and the helpers [`@usecairn/cli`](../cli) already
exports; it holds **no domain logic of its own**. Statuses move through core's
state machine, acceptance is judged by core's lint, stones are written by core's
writer. The server is a door, not a second implementation.

The one rule that lives *here* rather than in a prompt: **`create_draft` and
`amend_stone` run the acceptance lint and refuse when it fails.** There is no
`force` over MCP. An agent cannot argue its way past the guard-rail, because the
guard-rail is not in the conversation.

## Register it in Claude Code

```sh
claude mcp add cairn -- npx @usecairn/mcp --dir /path/to/project
```

`--dir` names the project whose cairn is served — the directory holding
`.cairn/`. It defaults to `CAIRN_DIR`, then to the working directory. The server
walks up from that directory to find the cairn, exactly like the `cairn` CLI, so
pointing at a subdirectory of the project works too.

stdout belongs to the protocol: every message the binary itself prints goes to
stderr.

```sh
cairn-mcp --dir .            # serve the cairn here
CAIRN_DIR=/srv/app cairn-mcp # same, through the environment
cairn-mcp --help
```

## Tools

All eight names are frozen. Every skill and app in this monorepo calls exactly
these.

| Tool | What it does |
| --- | --- |
| `list_stones` | List the cairn. Filters: `status`, `surface`, `includeRetired`. Retired stones are hidden by default. |
| `get_stone` | One stone in full — frontmatter, intent body, path. Accepts a unique id prefix. |
| `create_draft` | Raise a new draft stone. **Refused** when the acceptance criteria leak implementation detail. |
| `amend_stone` | Supersede a stone: a new draft `amends` it, the old one is retired with `amendedBy` set. Omitted fields are inherited. **Refused** on the same grounds, judging the criteria the amendment will actually carry. |
| `retire_stone` | Retire a stone; its proof leaves the active suite. Retired is terminal. |
| `record_run` | Fold a proof run into a stone (`green` / `red` / `missing`), stamping `lastGreen` with the commit and the sha256 of the proof. |
| `get_escalations` | Every stone waiting on a human. |
| `lint_acceptance` | Judge criteria without writing anything — the same lint the two guarded tools enforce. |

Every tool answers with JSON, both as text content and as `structuredContent`.
Refusals and failures come back as `isError` results carrying a structured
payload (`{ ok: false, error, message, ... }`), never as a protocol crash.

### The guard-rail, concretely

```jsonc
// create_draft { acceptance: ["the total appears in .cart-total"] }
{
  "ok": false,
  "error": "acceptance-criteria-are-user-language",
  "message": "Refused: acceptance criteria must be user language. …",
  "violations": [
    {
      "criterion": "the total appears in .cart-total",
      "index": 0,
      "rule": "css-selector",
      "match": ".cart-total",
      "message": "\".cart-total\" looks like a CSS class selector; …"
    }
  ],
  "formatted": ["[css-selector] the total appears in .cart-total\n    …"]
}
```

Nothing is written. Rewrite the criterion as what a user sees — *"the shopper
sees the total including tax"* — and try again.

### State transitions

`record_run` moves stones exactly as `cairn verify` does, because both call
core's `applyVerifyResult`:

- **green** — a `draft` or a `broken` stone becomes `proven`, and `lastGreen` is
  stamped (`at`, `commit`, `proofHash`). An already `proven` stone keeps its
  status with a refreshed `lastGreen`.
- **red** — a `proven` stone becomes `broken`. A **red draft stays a draft**: it
  has never been green, so there is nothing to regress. The way out of a draft
  that will not go green is escalation, not `broken`.
- **missing** — a `proven` stone whose proof vanished becomes `broken`; a draft
  without a proof is untouched.
- `escalated` and `retired` stones never move: one needs a human, the other is
  terminal.

## Resources

| URI | Contents |
| --- | --- |
| `cairn://stones` | The whole cairn as JSON, retired stones included. |
| `cairn://stone/{id}` | One stone (template; the id may be a unique prefix). |
| `cairn://status` | The synthesis: counts per status, proof coverage, and the drafts, broken and escalated stones. |

All three are `application/json`. The stone template lists every stone in the
cairn, so a client can enumerate them without calling a tool.

## For skills: prefer MCP over parsing CLI output

**When the Cairn MCP server is available in the session, skills use its tools
and resources. The CLI is for humans and for CI.**

Why: the tools return typed JSON that never has to be scraped out of a terminal,
the acceptance guard-rail is enforced server-side (so a skill cannot forget it,
and no prompt can override it), and the server speaks the same core that `cairn
verify` speaks — there is no drift between what an agent believes and what CI
will check.

Mapping, for skills written against the CLI:

| Instead of | Call |
| --- | --- |
| `cairn list --json` | `list_stones` |
| `cairn show <id> --json` | `get_stone`, or read `cairn://stone/{id}` |
| `cairn status --json` | read `cairn://status` |
| `cairn add --json` | `create_draft` |
| `cairn amend <id> --json` | `amend_stone` |
| — (no CLI equivalent) | `retire_stone` |
| the apply step of `cairn verify` | `record_run` |
| `cairn list --status escalated --json` | `get_escalations` |

Two things stay with the CLI on purpose:

- **`cairn verify`** actually runs Playwright. The MCP server never spawns a
  runner: an agent reports a *result* through `record_run`, it does not get to
  decide what "green" means. CI replays the proofs with no model in the loop.
- **`cairn init`** scaffolds a project; that is a human's first move.

And two things the server will not do, whatever it is asked:

- accept a `force` flag on `create_draft` / `amend_stone`;
- edit a stone in place. Stones are amended, never edited.

## Development

```sh
pnpm --filter @usecairn/mcp build
pnpm --filter @usecairn/mcp test
pnpm --filter @usecairn/mcp typecheck
```

The tests drive the real server through the SDK's `InMemoryTransport` and a real
`Client`, against temporary cairns on disk — every tool, every refusal, every
transition.
