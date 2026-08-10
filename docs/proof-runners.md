# Proof runners

The v1 limit, stated in [technical.md](technical.md): a proof is a Playwright
spec driving a web app in a browser. A CLI, an HTTP API, a cron job or a queue
consumer has nothing to prove it with.

This is the design for lifting that limit. It is written because the limit is
narrower than it looks: almost everything Cairn does is already indifferent to
how a proof is executed, and the part that is not is one file.

## 1. What is already runner-agnostic, and what is not

| Concern | Where | Why it does not care about browsers |
| --- | --- | --- |
| The stone | [`core/src/schema.ts`](../packages/core/src/schema.ts) | `proof: z.string().nullable()` is a *path*. Nothing says `.spec.ts` or Playwright; `defaultProofPath()` in [`stone-file.ts`](../packages/core/src/stone-file.ts) picks `<ulid>.spec.ts` as a convention. |
| The lint | [`core/src/lint.ts`](../packages/core/src/lint.ts) | It rejects CSS selectors, HTTP routes, identifiers, file paths and function calls in *criteria*. One rule of five is web-specific, and none of them is about execution. |
| The lifecycle | [`transitions.ts`](../packages/core/src/transitions.ts) | `applyVerifyResult(stone, "green" \| "red" \| "missing")` is the entire coupling between a run and the registry. It takes a verdict and knows nothing about where it came from. |
| Integrity | [`integrity.ts`](../packages/core/src/integrity.ts) | `hashProof()` is sha256 over LF-normalised text. It hashes a file; it does not parse it. |
| The ratchet | `selectStones()` in [`verify.ts`](../packages/cli/src/commands/verify.ts) | Filters on `status` and nothing else. `--proven-only` is a status predicate. |
| Exit codes | [`errors.ts`](../packages/cli/src/errors.ts) | `0` / `1` / `2` describe the cairn's happiness, not a runner. |
| Spawning | [`cli/src/playwright.ts`](../packages/cli/src/playwright.ts) | **Cairn never links against Playwright.** It spawns whatever the project has (`DEFAULT_RUNNERS`, `CAIRN_PLAYWRIGHT_CMD`, `--runner`), hands over spec paths, reads a JSON report back. That seam is the foundation of everything below. |

What is **not** agnostic lives in that same file, plus one config field:

- `parsePlaywrightReport()` walks Playwright's JSON shape — nested `suites`,
  `specs`, `tests[].status` (`expected` / `unexpected` / `flaky` / `skipped`),
  `results[].status`. The folding in `specStatus()` and `worse()` is general; the
  shape it reads is not.
- `runProofs()` hardcodes Playwright's argv (`--reporter=json`, `--retries=N`,
  proof paths trailing) and environment (`PLAYWRIGHT_JSON_OUTPUT_NAME`,
  `PLAYWRIGHT_BASE_URL`), and the error string says *"No Playwright runner could
  be started"*.
- `cairnConfigSchema` **requires** `baseURL`: a project whose only surface is a
  terminal cannot write a valid config today.

## 2. The runner abstraction

### 2.1 A `kind` on the stone

```ts
// proposed, packages/core/src/schema.ts
kind: z.enum(["browser", "cli", "http"]).default("browser"),
```

One stone, one kind; a promise spanning two surfaces is two stones, which is the
mason's granularity rule unchanged. The kind decides which runner executes the
proof and nothing else: not the transitions, not the hash, not the ratchet.

### 2.2 Declaring runners in `cairn.config.ts`

```ts
export default {
  baseURL: "http://localhost:3000",   // required only when a browser or http stone exists
  runners: {
    browser: { command: "pnpm exec playwright test", report: "playwright" },
    cli:     { command: "pnpm exec vitest run",      report: "vitest" },
  },
  retries: 0,
};
```

`command` is a command line, tokenized exactly as `--runner` is today
([`proc.ts`](../packages/cli/src/proc.ts) `tokenize()`), spawned with the project
root as cwd. `report` names the adapter that turns that runner's JSON into a
`ParsedReport`. Omitted kinds fall back to the built-in defaults, which is how
every existing project keeps working with no config change.

### 2.3 How `cairn verify` dispatches

`selectStones()` is unchanged. Runnable stones are then grouped by `kind`, each
group is one runner invocation, the `setup` hook still runs once for the whole run
before any group, and the per-kind reports merge into one lookup before each stone
is folded through `statusForProof()` and `applyVerifyResult()` exactly as today.

Two existing behaviours become per-kind and must stay strict. *"No runner could be
started"* fails that kind as a `CliError` with no stone marked broken — the
reasoning of the current `report.specCount === 0` guard: a missing browser in a CI
image is not evidence that fifty features regressed. And a proof that produced no
result is already counted in `noResult` and already exits `1`, which stops "we did
not run the cli kind today" from looking green.

A `--kind <k>` filter lets CI split kinds across jobs. If you split them, **every
job must be required** in branch protection
([`ci.md` §8](ci.md#8-checklist-for-wiring-the-ratchet-into-a-new-project)): a
ratchet with one kind unrun is a ratchet with a hole in it.

### 2.4 The report contract

The whole interface already exists — `ParsedReport` in `playwright.ts`:

> A runner receives a list of proof paths and produces, for each of them, one of
> `passed` / `failed` / `skipped`, keyed by file. Nothing else is read.

**One proof file is one stone**: several failing assertions fold to one `failed`
through `worse()`, and the file is the granularity a stone needs. **The basename
carries the stone id**, because `statusForProof()` falls back to it — `<ulid>.…`
is not decoration. **Absent is not passed, and `skipped` is not passed either**:
both become `no-result`, which exits `1`, so a proof that runs only sometimes is
not a proof. **Retries are the runner's job** — Playwright's `flaky` outcome folds
to `passed` because the project's `retries` policy already applied, and a new
runner must apply `retries` itself and report the final outcome.

`parsePlaywrightReport()` becomes one adapter in a small closed set. A runner
whose output matches none of them may emit the neutral shape directly:

```json
{ "proofs": [{ "file": ".cairn/proofs/01J8….cli.spec.ts", "status": "passed" }], "errors": [] }
```

## 3. Two concrete runners

### 3.1 `kind: cli` — "a user runs command X and observes Y"

**What executes.** A spec file under the project's own node test runner, spawned
through the same seam as Playwright; Cairn links against neither. The proof
imports a thin harness (`run()`, plus assertions over its result) so the
determinism rules below hold by construction rather than by review. It may assert
on the observable surface of a command-line program and nothing else: exit status;
what the user reads on stdout and stderr; files that appear, change or disappear
**inside the sandbox**; and what a second run of the same command does, because
idempotence is a promise users care about and CLIs break it often.

**Determinism and sandboxing.** A CLI reads far more of the machine than a page
does, and every one of those reads is a flake waiting for 18:40. Each proof gets a
fresh temporary directory as cwd and as `HOME`/`XDG_*`, an environment built from
an allowlist rather than inherited, `TZ=UTC`, `LANG=C.UTF-8`, `NO_COLOR=1`, a
pinned `PATH` and a hard timeout; assertions on paths outside the sandbox are
refused by the harness. Clock, randomness and network stay the application's
problem: if the output is not reproducible, the honest outcome is a red proof and
a defect, not a looser assertion. The app under test is named the way a user
invokes it — `myapp` on `PATH`, or `node ./dist/myapp.js`. That is the built
artifact, and building it belongs in `setup`, not to the warden.

**What the lint means when the surface is a terminal.** A CLI's interface is
literally text that looks like code, and the lint bans things that look like code.
The distinction that holds: **what the user types and reads is user language; what
the program is made of is not.**

| Legal | Refused, and why |
| --- | --- |
| "running the init command creates the registry and says so" | "`bin.js` exits 0" — a source file and an exit code; nobody observed either |
| "running init twice destroys nothing and says the registry is already there" | "the second run short-circuits on `existsSync`" — an identifier |
| "adding a feature without the user's own words is refused, with an explanation" | "`cairnAdd` returns exit code 2" — an identifier and a number |

Exit codes are never acceptance criteria. A user does not observe `2`; a user
observes *"it refused and told me why"*. The proof asserts the exit code — that is
the proof's job, exactly as a browser proof asserts a locator count for *"the cart
page shows no article"*.

Honestly about the lint's reach: it is a conservative regex filter, and
terminal-shaped prose slips through — `.cairn/stones` has no extension and passes
today. The lint is a floor, not a certificate. For `cli` stones the mason's test is
its existing one, transposed: *could someone who has never seen the repository
check this by typing the command?* No new lint rules are proposed; rules catching
CLI leakage would raise the false-positive rate on ordinary prose, and `lint.ts`
already names a false positive as the worse failure — it blocks a legitimate stone.

### 3.2 `kind: http` — request in, response out

Chosen over a queue runner because it can be designed honestly. An API's product
surface *is* the request and the response: both fully observable from outside,
both deterministic given a seeded state, and there is a completion signal — the
response arrives or it does not. In most projects nothing new executes, because
Playwright's request context already drives an API with no browser: `kind: http`
is a profile of the existing runner more than a new one. A project without
Playwright declares its own runner, like the cli kind.

**The cost, stated plainly.** The `http-route` lint rule exists because a route is
implementation detail for a web app. For an API *product* the route is the promise
— `POST /orders returns the created order` is what that product's user was
promised, and the lint refuses it today with exit `2`. Two honest resolutions, no
third: **do not ship `kind: http`**, keeping the lint frozen and accepting that
API products are out of scope; or **make the lint per-kind**, so an `http` stone
may name a route and a status family — its user language — while still refusing
handler functions, table names, plumbing headers and source files. The second is
the recommendation, and the one place in this design where a runner kind reaches
back into the domain. If we are not willing to pay that, the correct move is the
first, not criteria written in euphemisms to sneak a route past a regex.

### 3.3 Why the queue consumer is not here

Triggering is easy: publish a message. **Observing is the problem.** A consumer's
effect is a side effect somewhere else — a row written, a mail sent, a downstream
message. To observe it you must either reach into the implementation's storage, at
which point the warden reads the schema, stops being blind, and the proof becomes
a mirror of the implementation (the tautology the whole design exists to avoid);
or observe it through a surface a user actually has, in which case **the stone
belongs to that surface**. *"The order confirmation arrives in the inbox within a
minute"* is a stone about a mailbox; that a queue delivers it is not a promise
made to anyone.

There is also no completion signal: a consumer proof can only poll and give up,
which means a timeout, which means flakiness, and
[`ci.md` §4](ci.md#4-flakiness-policy) is not negotiable about what flakiness does
to the ratchet's authority. So most queue features are already provable on the
surface where their effect is visible, and the rest are infrastructure — not a
feature, zero stones. A `job` kind is deferred for a reason, not for lack of time.

## 4. What does not change

- **The mason and the warden stay different agents.** More runners widen what a
  user can observe; they do not widen what counts as a feature. *"Every read
  command can print its answer as machine-readable output"* is a stone; *"the CLI
  is refactored to share an argv parser"* is still zero stones.
- **The warden stays blind.** For a CLI, blind means it gets *the built artifact
  and nothing else*: the command on `PATH`, its help output, its behaviour. It
  executes `dist/`; it does not read `dist/`. In the profile of
  [`orchestration.md` §3.2](orchestration.md#32-warden-subagent--claudesettingsjson)
  that is `Bash(myapp:*)` allowed alongside `Read(./dist/**)` denied — and the
  strongest form, a container without the source at all, is *easier* here than for
  a web app, because a CLI installs as a binary.
- **The frozen-proof integrity model.** `hashProof()` over LF-normalised text,
  stamped into `lastGreen.proofHash` on green, audited by
  `cairn verify --integrity --no-run`. Identical for every kind, and the reason a
  proof must stay text a human can read in a diff.
- **The lifecycle and the budget.** `draft → proven → broken`, `escalated` as the
  status no run may move, `N = 3`. None of it mentions a browser today and none of
  it should mention a runner tomorrow.

## 5. Migration and compatibility

`proof: string | null` is untouched. `kind` arrives as an optional field
defaulting to `"browser"`, which is the only reason this is not a breaking change.
A stone on disk with no `kind` parses to `kind: "browser"`, so every existing cairn
keeps verifying with no edit. `persist()` in `verify.ts` writes a stone only when
the parsed value actually differs, so the default causes **no mass rewrite**: the
field appears in frontmatter the next time a stone is legitimately written, and
its absence and its presence mean the same thing. Proof hashes are unaffected —
`kind` lives on the stone, not in the proof. `cairn add --kind cli` is a new flag;
without it, `add` behaves as it does now.

`cairn verify --all` with mixed kinds runs each group in turn and merges the
reports. The failure modes are the ones that already exist:

| Situation | Outcome |
| --- | --- |
| A kind has no runner declared and no default | `CliError`, no stone moves, exit `1` |
| One kind's runner blows up before running anything | That kind's stones do not move; other kinds still report; the run fails |
| A kind was not run at all (`--kind` filter, missing job) | Its stones are `no-result` → exit `1`. Never silently green |
| A `browser` stone in a project with no `baseURL` | Config error, exit `2`. `baseURL` becomes required only for the kinds that need it |

Exit codes keep their meanings exactly: `0` all good, `1` the cairn is unhappy,
`2` refused. CI still only reads the number.

## 6. What we refuse to build

**No plugin marketplace, and no dynamic runner loading.** A runner is a command
line in the project's own `cairn.config.ts` plus a report adapter from a small
closed set shipped with Cairn; nothing is resolved from a registry at run time.
The trust boundary is the one `start` and `setup` already have: code the project
already chose to install. A marketplace would make "what proved this stone?"
depend on something outside the repository, and the point of the cairn is that the
answer is in the repository.

**No arbitrary shell-script proofs.** This is the one that will be asked for most,
so: *an arbitrary script is not a proof, it is a test.* Three mechanical
differences.

1. **Determinism.** A proof is replayed forever with no model in the loop, on
   machines nobody has seen yet. A script that curls a live service, reads the
   clock or depends on a globally installed tool answers a different question
   every run — green today, red on Tuesday with an identical tree. That is
   precisely the flakiness that costs the ratchet its authority.
2. **The report contract.** A script has an exit code. `ParsedReport` needs
   `passed` / `failed` / `skipped` *per proof file*, and Cairn distinguishes
   "failed" from "never ran" because the second is a broken toolchain, not fifty
   regressions. An exit code cannot express that difference, so a script cannot
   participate in the contract that makes `cairn verify` readable at 18:40.
3. **Integrity.** `hashProof()` freezes the *text* of a proof; it cannot freeze
   the behaviour of everything that text shells out to. A spec whose assertions
   are visible in the file is evidence. A two-line script delegating to a moving
   target has a stable hash and no stable meaning — the audit would keep saying
   `match` while the guarantee quietly evaporated.

For the same reason, **no binary or generated proofs**: the last line of defence
against a weakened proof is a person reading the diff.

**No bypass, no advisory kinds, no per-kind budget, and no model at run time.**
There is no `--force`, and adding one for a new kind is not on the table either: a
proven `cli` stone is defended exactly as hard as a proven `browser` one, and a
kind that cannot be made to pass honestly is a kind we should not have shipped.
And the moment a proof needs a model to decide whether it passed, it stops being
an artifact and becomes a conversation — the cost of the guarantee stops being the
cost of running the runner. That is the line the whole design rests on, and no
surface is worth crossing it for.
