# The red pipeline protocol

This document is written to be read in anger, at 18:40, with a red pipeline and
a merge request you wanted to land before dinner. Everything you need is in the
first section. The rest is the reasoning.

The ratchet is `cairn verify --all --proven-only`. It replays the proofs of
every **proven** stone — every feature a human already accepted and a warden
already greened. If one goes red, your branch broke a feature that was working,
and the merge is blocked. There is no bypass flag, and adding one is not on the
table.

Templates for the job itself:
[`packages/cli/templates/ci/gitlab-ci.cairn.yml`](../packages/cli/templates/ci/gitlab-ci.cairn.yml)
and
[`packages/cli/templates/ci/github-actions.cairn.yml`](../packages/cli/templates/ci/github-actions.cairn.yml).

---

## 1. From red pipeline to "I know which stone and why", in under a minute

### 0:00 — Read the last twelve lines of the job log

`cairn verify` prints one line per stone and nothing else you need:

```
✗ 01J8RCK4  Checkout shows the total before payment  proven → broken
✓ 01J8RCM9  A guest can add an item to the basket    proven

1 green · 1 red · 0 skipped
```

Left to right: the mark, the **short stone id**, the **title in user language**,
and the **status move**. `proven → broken` is the only move that matters: it
means a feature that was working no longer is.

If several stones went red, the one at the top of the list is the oldest stone
(ids are ULIDs, sorted chronologically), which is usually the most upstream
cause. Start there.

> Nothing in the log? The job may have died before the proofs ran. See
> [§6, exit codes](#6-exit-codes-what-the-number-actually-means).

### 0:15 — Ask the stone what it promised

```sh
cairn show 01J8RCK4
```

You get the title, the **acceptance criteria in user language**, the intent
body, the lineage (what this stone amends, what amended it), and `lastGreen` —
the timestamp, commit and proof hash of the last time it was true. That commit
is your bisect anchor: the feature was working there.

Pick the criterion that the change you just made could plausibly have broken.
Usually there is exactly one and it is obvious once you read them.

### 0:30 — Open the trace

The proof is one Playwright spec file per stone,
`.cairn/proofs/<stone-id>.spec.ts`. Download the pipeline artifacts (they are
attached with `when: always` / `if: always()` precisely for this moment) and
look in `test-results/`:

```
test-results/
  cairn-proofs-01J8RCK4-...-chromium/
    trace.zip           <- the whole run, step by step, with DOM snapshots
    test-failed-1.png   <- the screenshot at the moment of failure
    video.webm          <- if your playwright.config records it
```

```sh
npx playwright show-trace test-results/<dir>/trace.zip
```

The trace shows the exact step that failed, the page as it was, the network and
the console. If the warden wrote one `test()` per acceptance criterion — the
convention, not something the schema enforces — the failing test's title *is*
the criterion, and you are done: you know the stone and the criterion.

> Traces and screenshots only exist if your `playwright.config.ts` records
> them. Set `use: { trace: "retain-on-failure", screenshot: "only-on-failure" }`
> once, now, so the next red is diagnosable.

### 0:45 — Reproduce locally

```sh
cairn verify 01J8RCK4 --verbose
```

Same runner, same setup hook, one stone. If it is green locally and red in CI,
you are in [§4, flakiness](#4-flakiness-policy) — or your seed differs, which is
[§5](#5-seed-and-fixtures).

### Machine-readable version of all of the above

Every read command has `--json`, and the ratchet job attaches
`cairn-verify.json`:

```sh
jq '.results[] | select(.to == "broken") | {id, title, reason, proof}' cairn-verify.json
```

The payload carries `results[]` (`id`, `title`, `from`, `to`, `result`,
`reason`, `proof`), a `summary` (`green`, `red`, `broken`,
`integrityFailures`), the `commit`, the runner `command`, and `exitCode`. This
is what the cairn-triage skill reads.

---

## 2. The three legitimate outcomes

A red ratchet has exactly three honest endings. Pick one; there is no fourth.

### A. Fix the code — the common case (a regression)

The intent did not change. Your diff broke a feature that a human accepted.
The stone is right and the code is wrong.

Fix the code, push, the proof goes green again, and `cairn verify` moves the
stone `broken → proven` on its own. Nothing to do in `.cairn/`. You do not
touch the proof — you are not allowed to, and you would not want to: the proof
is the only thing in the loop that has not been contaminated by your reading of
the code.

### B. Amend the stone, in the same merge request (the intent changed)

The feature genuinely should behave differently now. The old promise is
obsolete. Say so, in the registry, in the same merge request that changes the
behaviour:

```sh
cairn amend 01J8RCK4 \
  --title "Checkout shows the total including delivery before payment" \
  --acceptance "The total shown before payment includes delivery" \
  --acceptance "Changing the delivery option updates that total" \
  --request "<the verbatim ask that justified the change>"
```

What happens: a **new draft stone** is created pointing back at the old one
(`amends`), and the old stone is **retired** pointing forward (`amendedBy`).
Stones are never edited — they are amended, and both directions of the lineage
stay in the file. The retired stone's proof leaves the active suite, so
`--proven-only` stops replaying it and the ratchet goes green. The new stone is
a draft with no proof: the warden writes a new one, blind to your code, and the
stone becomes proven when that proof goes green.

This is a *recorded decision*, visible in the diff of the merge request,
reviewable by a human, attributable. That is why it is the only legitimate way
to land a change that turns a proven stone red — and why it must be in the
**same** merge request. An amendment in a follow-up merge request is a bypass
wearing a hat.

If the lint refuses your new criteria (exit code 2), it is because they leaked
implementation language — a CSS selector, an HTTP route, a camelCase
identifier, a file path, a function call. Rewrite them as what a *user* sees.
That refusal is the point of the lint, not an obstacle to route around.

### C. Escalate — you do not know which of A and B it is

The coder ↔ warden loop has a budget of **three attempts**. When it is spent,
or when a human genuinely cannot tell whether this is a regression or an intent
change, the stone is handed back to a human:

```sh
cairn escalate 01J8RCK4 --attempts 3
```

The stone goes to `escalated` and stops moving: no verify run will change it
again, in either direction. The only ways out are an **amendment** (the intent
changed — `cairn amend`) or a **retirement** (the feature is gone — the
`retire_stone` MCP tool; the v1 CLI exposes only `amend`). Escalation is not
failure; it is refusing to guess. Attach the three things a human needs: the
**diff**, the **proof**, and the **trace**.

### The fourth outcome, which is forbidden

**Deleting the proof. Weakening the proof. Commenting out an assertion.
`test.skip`. Editing the spec until it passes.**

This is not a shortcut, it is the destruction of the only evidence that the
feature ever worked. Two mechanisms exist to catch it:

1. **File permissions.** Coder agents have no write access to `.cairn/`. The
   warden owns it. If a coder agent modified a proof, your permissions are
   wrong — fix that first.

2. **The integrity audit**, which runs as its own job and takes seconds:

   ```sh
   cairn verify --integrity --no-run
   ```

   It spawns no runner and no app. It re-hashes every proof on disk (sha256,
   LF-normalised) and compares it with `lastGreen.proofHash` — the hash recorded
   the last time that exact proof was green. A `mismatch` means the proof of a
   proven stone changed without a green run. A `missing` means the proof of a
   proven stone is gone. Either way the job exits 1 and the merge is blocked.

   A proof legitimately changes only when the warden rewrites it, and then the
   next green run re-stamps the hash. So a mismatch on a merge request is a
   question that needs an answer, not noise to be silenced.

---

## 3. Why `--proven-only`, and what it does not do

The ratchet only replays stones whose status is `proven`. Everything else is
deliberately out of scope:

| Status      | Replayed by the ratchet? | Why |
| ----------- | ------------------------ | --- |
| `draft`     | no  | Nobody has accepted it yet. Work in progress must not block a merge. |
| `proven`    | **yes** | A human accepted it and it was green. This is what is being defended. |
| `broken`    | no  | Already known to be red; it is not new information from your branch. |
| `escalated` | no  | Waiting for a human decision. A pipeline cannot make it. |
| `retired`   | no  | Superseded or removed. Its proof is never handed to the runner. |

Two consequences worth internalising:

- A red draft **does not** make the stone `broken` — `draft → broken` does not
  exist in the state machine. A draft that will not go green leaves through
  `escalate`, not through `broken`. But note that a plain `cairn verify` (no
  `--proven-only`) still **exits 1** on a red draft: the run was not a success
  even though no stone moved. That is why the ratchet job uses
  `--proven-only` and your local runs generally should not.
- The ratchet only ever *tightens*. Adding stones adds obligations; the only
  way an obligation is removed is an amendment or a retirement, both of which
  are recorded in the registry.

---

## 4. Flakiness policy

Verbatim, and not negotiable:

> **Retry proofs at most ×2 in CI. A proof that flips green/red with no code
> change is quarantined: the stone goes `broken` with the reason `flaky`
> recorded, and goes back to the warden for a rewrite. No infinite retries
> masking the problem.**

### Where the ×2 lives

In `cairn.config.ts`, not in the CI job:

```ts
export default {
  baseURL: "http://127.0.0.1:3000",
  retries: 2, // Playwright-level, per proof, hard cap
};
```

`cairn verify` passes this through as `--retries=2`. Playwright then reports a
proof that failed once and passed on retry with the outcome **flaky** — which
Cairn folds to green, because the project's own retry policy was applied. The
information is not lost: it is in the Playwright report and in the artifacts.

Job-level retries are a different thing and are **forbidden** for proof
failures. Re-running the whole job (GitLab `retry: 2`, GitHub "re-run failed
jobs") does not retry a proof, it re-rolls the dice on the entire ratchet and
hides the red. The only defensible job-level retry is scoped to infrastructure
(`runner_system_failure`, `stuck_or_timeout_failure`) and never to the outcome
of the proofs.

### Quarantine: how it actually works in v1 (read this honestly)

A proof that flips with no code change is not a code problem and not a retry
problem. It is a bad proof. It must leave the ratchet and go back to the warden.

**The schema has no dedicated field for this.** A stone carries `status`,
`acceptance`, `provenance` (`request`, `attempts`, `tokens`), `lastGreen` and
`proof` — there is nowhere to write `reason: "flaky"`. So in v1 the reason is
recorded in prose, and the mechanism is the one Cairn already has:

1. The flip already moved the stone `proven → broken` on the red run. That part
   is automatic and correct: a proof that cannot be trusted is not proving
   anything.

2. Record the reason and take the proof out of the suite with an **amendment**,
   whose markdown body is where `flaky` is written down:

   ```sh
   cairn amend 01J8RCK4 \
     --intent "$(cat <<'EOF'
   ## Quarantined: flaky

   The proof for this stone flipped green/red across three pipelines with an
   identical tree (pipelines #4412, #4415, #4419, commit a1b2c3d). Suspected
   cause: the proof asserts on the basket badge before the cart request settles.

   The intent is unchanged. Only the proof needs rewriting. Warden: rewrite
   without the timing assumption, blind to the implementation as usual.
   EOF
   )" \
     --request "<the original verbatim ask, carried over unchanged>"
   ```

   The old stone is retired (its flaky proof leaves the suite, so the ratchet
   stops flapping and stops blocking everyone else), and a new draft carries the
   same intent and criteria forward, with the quarantine note in its body, with
   no proof. The warden writes a fresh one.

   Do **not** carry the proof over with `--carry-proof` here: the proof is the
   thing that is wrong.

3. The stone is a draft until the new proof is green. It is not defended by the
   ratchet during that window. That is the cost of quarantine, and it is
   accepted deliberately: a flapping proof blocking every merge in the repo is
   worse than one feature temporarily undefended, and the draft is visible in
   `cairn status`.

**This is honest but not satisfying, and it is a known v1 limitation:**
"quarantined because flaky" is prose, so it cannot be counted, filtered or
alerted on. The amendment also loses the amended stone's `lastGreen` history
behind a retirement, which is the wrong shape for something that is not an
intent change at all.

> **v2 schema candidate.** A first-class quarantine on the stone, e.g.
> `quarantine: { reason: "flaky" | "environment" | "toolchain", since: <iso>,
> evidence: string[] }`, plus a `reason` on the `broken` status and a
> `cairn quarantine <id> --reason flaky` command that does not require an
> amendment. Then a flaky proof is a queryable state ("show me every stone
> quarantined for more than a week"), the lineage stays clean, and the warden
> gets a work queue instead of a prose note. Deliberately not built in v1.

### What is *not* flakiness

Before quarantining, rule out the boring causes — they look identical from the
job log and they are far more common:

- **The seed differs between local and CI.** See §5.
- **The Playwright browser version does not match the image.** The single most
  common "works locally, red in CI".
- **A genuine race in the application**, which the proof is correctly catching.
  Quarantining that one hides a real bug. If the trace shows the app in a state
  a user could reach, it is outcome A, not flakiness.

---

## 5. Seed and fixtures

The v1 answer for reproducible state is the `setup` hook in `cairn.config.ts`:

```ts
export default {
  start: "npm run dev",
  baseURL: "http://127.0.0.1:3000",
  setup: "npm run seed", // run once, before the proofs, in the project root
  retries: 2,
};
```

`cairn verify` runs it before any proof, with `CAIRN_BASE_URL` exported, and
**fails the whole run if it fails** — a proof running against unseeded state is
worse than no proof at all. Because the hook lives in the config and not in the
pipeline, the state is identical locally and in CI, which removes an entire
class of "green on my machine". Do not duplicate the seed in the CI job; the CI
templates only leave a commented step for state Cairn cannot own (a database
service migration, an external fixture upload).

### The open question, stated plainly

`setup` is **one global command for the whole run**. That is enough for an app
whose proofs can all share one fixture set, and it is not enough for a
rich-state application where one stone needs an empty basket, another needs a
basket with three items and an expired promotion, and a third needs a user
mid-onboarding. Today the only ways to express that are to make the seed a
superset of everything (fragile, and it couples every proof to every other) or
to have each proof build its own state through the UI (slow, and it makes proofs
depend on features other stones own).

**Per-stone fixtures are a known gap and are deliberately unresolved in v1.**
The design question is not "how do we run a script per stone" — that is easy —
but who owns the fixture: if the warden writes it, the warden stops being blind
to the implementation, which is the constraint the whole system rests on. That
tension is not resolved yet and will not be resolved by adding a field in a
hurry.

---

## 6. Exit codes: what the number actually means

The CLI exit codes are a contract. In a pipeline they tell you *who* is broken:

| Code | Meaning | Who is broken | What to do |
| ---- | ------- | ------------- | ---------- |
| `0` | Every selected proof held. | Nobody. | Merge. |
| `1` | A proof went red, a proven stone lost its proof, or the integrity audit failed. | The code, the intent, or the proof. | §2: fix, amend, or escalate. |
| `2` | Cairn refused the invocation: bad usage, or acceptance criteria that failed the lint. | **The pipeline or the command**, not your branch. | Fix the workflow or rewrite the criteria in user language. |

Two failures deserve their own reflex because they look like a red but are not:

- **"No Playwright runner could be started"** — the runner is missing in the
  job image. Install Playwright, or set `--runner` / `CAIRN_PLAYWRIGHT_CMD`.
  No stone moved; nothing regressed.
- **"The proof runner failed before any proof ran"** — a broken toolchain or a
  bad `playwright.config.ts`. Cairn deliberately does **not** mark every stone
  broken in this case: a runner that blew up is not evidence that fifty
  features regressed.

---

## 7. How cairn-triage plugs in

`cairn-triage` is the skill that reads a red and **classifies** it. It is
invoked in one of two ways:

- **Manually**, by whoever is looking at the red: point it at the pipeline's
  `cairn-verify.json`, the diff of the merge request, and the Playwright
  artifacts.
- **Pipeline-triggered**, as a job that runs on failure of the ratchet, posting
  its classification as a comment on the merge request.

What it produces is a **classification and the evidence for it**, one of:

- **regression** — the diff plausibly explains the failing criterion; outcome A,
  fix the code. It names the files in the diff it believes are responsible.
- **intent change** — the diff implements something the stone's acceptance
  criteria contradict on purpose; outcome B, amend the stone in this merge
  request. It drafts the new criteria in user language for a human to accept or
  rewrite.
- **flaky / environment** — the proof flips with no relevant change, or the
  failure is in the harness rather than the app; §4.
- **cannot tell** — outcome C, escalate, with the diff, the proof and the trace
  bundled.

What it does **not** do, ever:

- **It does not repair.** It does not edit code, it does not edit proofs, it
  does not amend stones. It classifies and hands back. The classification is a
  hypothesis for a human or for the coder agent, never an action.
- **It does not write to `.cairn/`.** Only the warden does.
- **It does not decide to bypass.** There is nothing to bypass.

Triage is a reading aid with an opinion, and its opinion is auditable because it
must cite the criterion, the trace step and the diff hunk it based the call on.
When it cannot cite them, the honest output is "cannot tell".

---

## 8. Checklist for wiring the ratchet into a new project

1. `cairn init`, then set `baseURL`, `start`, `setup` and `retries: 2` in
   `cairn.config.ts`.
2. In `playwright.config.ts`, record the evidence:
   `use: { trace: "retain-on-failure", screenshot: "only-on-failure" }`.
3. Copy the CI template for your host from `packages/cli/templates/ci/`.
4. Make **both** jobs required in branch protection / merge request approval
   rules: `cairn:verify` and `cairn:integrity`. A ratchet that is not required
   is decoration.
5. Remove write access to `.cairn/` from every agent except the warden.
6. Verify the whole thing works by breaking something on purpose, once, and
   walking §1 with a stopwatch.
