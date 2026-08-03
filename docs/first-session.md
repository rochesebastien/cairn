# Your first session

One feature, from a sentence a user said to a stone that CI will defend forever.

The example is a real one: a shopper asks to be able to empty their cart. We go
through the mason, the human review, the warden's blind proof, one red round with
the coder, the green, and the audit that keeps it honest. Every transcript below
is the actual output of the commands, not a sketch.

Vocabulary, once: the **cairn** is the registry in `.cairn/`, a **stone** is one
feature, a **proof** is the deterministic Playwright spec that proves it.

**Before you start.** You need a web app that runs locally, Playwright installed
in it, and `cairn` on your `PATH` (see the [README quickstart](../README.md#quickstart)).
v1 proves web UIs in a browser and nothing else.

---

## 0. Raise the cairn

```sh
cairn init
```

```
✓ cairn raised in /srv/shop
· created .cairn/
· created .cairn/stones
· created .cairn/proofs
· created .cairn/.gitignore
· created cairn.config.ts

· next: cairn add --title "..." --acceptance "..." --request "..."
```

Open `cairn.config.ts` and make four decisions:

```ts
export default {
  start: "pnpm dev",                 // exported to the runner as CAIRN_START
  baseURL: "http://localhost:3000",  // exported as CAIRN_BASE_URL and PLAYWRIGHT_BASE_URL
  setup: "pnpm seed:e2e",            // run once before every verify — your determinism lever
  retries: 0,                        // proofs are deterministic; retries hide flakiness
  stonesDir: ".cairn/stones",
  proofsDir: ".cairn/proofs",
};
```

Cairn does not start your app. It hands `CAIRN_START` and `CAIRN_BASE_URL` to the
runner, and your `playwright.config.ts` owns the lifecycle:

```ts
export default defineConfig({
  webServer: { command: process.env.CAIRN_START!, url: process.env.CAIRN_BASE_URL },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? process.env.CAIRN_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
```

Those last two lines are what makes a failure legible later. Set them now.

`setup` deserves a moment of thought. A proof must start from a known state — a
seeded catalogue, a signed-in user, a filled cart. If that state is built by
twenty UI steps inside the spec, the proof is slow, brittle, and secretly depends
on five other features. Put it in `setup`.

Commit `.cairn/stones/`, `.cairn/proofs/` and `cairn.config.ts`. They are source.
`.cairn/.gitignore` already excludes the run output (`runs/`, `reports/`, traces).

---

## 1. The mason: a sentence becomes a stone

The user said, in their own words:

> *"je veux pouvoir vider mon panier d'un coup, c'est pénible de supprimer les
> articles un par un"*

The [`cairn-mason`](../.claude/skills/cairn-mason/SKILL.md) skill does three
things with that, in order, and the order matters.

**First, it decides whether there is a feature at all.** A request that produces
no user-observable change produces **zero stones** — a refactor, a dependency
bump, a rename, a log line, a test-only change. The mason says so and writes
nothing. Padding the cairn to look productive is the failure mode; an empty
outcome is often the correct one.

**Second, it checks whether this behaviour already exists.** `cairn list --json`,
then `cairn show <id> --json` on anything that looks close. A request that
*changes* an existing promise is an amendment, never a second stone — two stones
for one behaviour means two proofs, and one of them is wrong.

**Third, it writes the criteria in the user's own language.** This is the part
the machine enforces:

```sh
cairn add \
  --title "Empty the cart from the cart page" \
  --intent "Shoppers change their mind before paying. Removing items one by one is the friction they complained about." \
  --acceptance "after emptying the cart, the cart page shows no article and a total of 0 €" \
  --acceptance "the cart counter in the header shows 0" \
  --surface checkout \
  --request "je veux pouvoir vider mon panier d'un coup, c'est pénible de supprimer les articles un par un" \
  --proof
```

Agents send the same content as JSON on stdin instead — no TTY, no quoting
games:

```sh
echo '{
  "title": "Empty the cart from the cart page",
  "intent": "Shoppers change their mind before paying.",
  "acceptance": [
    "after emptying the cart, the cart page shows no article and a total of 0 €",
    "the cart counter in the header shows 0"
  ],
  "surface": "checkout",
  "provenance": {"request": "je veux pouvoir vider mon panier d'\''un coup…"},
  "proof": true
}' | cairn add --json
```

Two fields carry more weight than they look like they do.

`--request` / `provenance.request` is the user's ask, **verbatim, never
paraphrased**, in whatever language it was said. When a criterion and a diff
disagree six months from now, this sentence is the tie-breaker.

`--proof` (or `"proof": true`) declares where the proof will live:
`.cairn/proofs/<ulid>.spec.ts`. Declare it at creation. A stone with no proof
path has nowhere for the warden to write, and the warden is not allowed to invent
one — it will hand the stone straight back.

### What the lint refuses

Try to smuggle implementation detail in and the CLI refuses with exit `2`,
writing nothing:

```sh
echo '{"acceptance":["the total appears in .cart-total"],"provenance":{"request":"x"},"proof":true}' \
  | cairn add --json; echo "exit=$?"
```

```json
{
  "ok": false,
  "error": "acceptance-criteria-are-user-language",
  "violations": [
    {
      "criterion": "the total appears in .cart-total",
      "index": 0,
      "rule": "css-selector",
      "match": ".cart-total",
      "message": "\".cart-total\" looks like a CSS class selector; describe what the user sees, not how it is marked up"
    }
  ]
}
exit=2
```

Five rules, and each one is a way of accidentally writing the test instead of the
promise:

| Rule | Rejects | Rewrite as |
| --- | --- | --- |
| `css-selector` | `#submit`, `.error-message`, `[data-testid=email]` | what the user points at: the label on the button |
| `http-route` | `POST /api/orders`, `GET /cart` | what the user sees happen |
| `identifier` | `isLoggedIn`, `submitOrder` | what that state makes visible |
| `file-path` | `src/cart/actions.ts` | the observable consequence |
| `function-call` | `clearCart()` | the user action that triggers it |

Rewriting is not deleting the offending token — it is restating the same
observation from the user's seat. `clearCart() empties the cart` becomes
`emptying the cart from the cart page leaves it with no article`.

`--force` exists for humans who knowingly accept the debt. A mason that forces
has failed at its only job.

---

## 2. The human review — the cheap moment

You now have a draft:

```sh
cairn list
```

The whole point of reviewing here is arithmetic: a wrong promise caught at draft
time costs one sentence. Caught after the warden proved it, it costs an
amendment, a retired stone, and a rewritten proof. Three questions, in order:

1. **Granularity.** Is this one scenario — one entry point, one sequence of
   actions, one set of observations? *Too coarse* is the common error. "Espace
   client" with five criteria is five journeys and one proof that cannot fail
   informatively. Conversely, three observations made in the same scenario at the
   same moment are one stone with three criteria, not three stones.
2. **Truth.** Does the criterion say what the user actually asked for, or what
   you would enjoy building?
3. **Provability.** Could a person with no access to the code check this in a
   browser? If not, the warden cannot either.

Skipping this review is legitimate for a solo project (call it YOLO mode); on a
shared one it is how a wrong promise gets frozen into a proof.

---

## 3. The warden: a proof written blind

Hand the id to [`cairn-warden`](../.claude/skills/cairn-warden/SKILL.md). Its one
non-negotiable rule:

> **It never reads application source code.** Not the components, not the routes,
> not the styles, not the existing tests, not the diff, not the commit message.

It works from three things: the intent, the criteria, and the live app in a
browser. This is not ceremony. A proof written from the code proves the code does
what the code does. A proof written from the intent proves the product does what
the user was promised. That is the difference between evidence and a mirror.

The warden loads the stone, checks that `proof` is non-null, that the status is
`draft` or `broken`, and that the criteria are non-empty:

```sh
cairn show 01KZ4XGH --json
```

Then it explores the running app through the **accessibility tree** — the
Playwright MCP browser tools if the session has them, a throwaway
`ariaSnapshot()` spec in the git-ignored `.cairn/runs/` otherwise. It is looking
for exactly four things: the entry point, the accessible name of every control
the journey touches, the text a user reads at the end, and the starting state.
Not class names, not test ids, not DOM structure.

Then it writes one file, at the path the stone declared:

```ts
// .cairn/proofs/01KZ4XGHGEXZ0DPYTA22QYVDHF.spec.ts
import { expect, test } from "@playwright/test";

test.describe(
  "Empty the cart from the cart page",
  { annotation: { type: "stone", description: "01KZ4XGHGEXZ0DPYTA22QYVDHF" } },
  () => {
    test("after emptying the cart, the cart page shows no article and a total of 0 €", async ({ page }) => {
      await page.goto("/cart");

      await page.getByRole("button", { name: "Vider le panier" }).click();

      await expect(page.getByText("Votre panier est vide")).toBeVisible();
      await expect(page.getByRole("listitem")).toHaveCount(0);
      await expect(page.getByText("Total : 0 €")).toBeVisible();
    });

    test("the cart counter in the header shows 0", async ({ page }) => {
      await page.goto("/cart");

      await page.getByRole("button", { name: "Vider le panier" }).click();

      await expect(page.getByRole("status", { name: "Articles au panier" })).toHaveText("0");
    });
  },
);
```

Four properties of that file are load-bearing:

- **The ULID is in the annotation.** That is the machine-readable link between
  spec and stone.
- **One `test()` per criterion, titled with the criterion verbatim.** When it goes
  red, the failing test title *is* the unsatisfied promise — which is what makes a
  failure report writable without leaking a single line of the spec.
- **Roles, labels and text only.** No `page.locator("css")`, no `[data-testid]`,
  no XPath. If a control has no accessible name, that is a real defect of the
  product, and the honest move is to report it as a failing criterion rather than
  route around it.
- **No sleeps, no conditionals.** Web-first assertions retry on their own.
  `waitForTimeout` and `if (await x.isVisible())` are how a proof becomes a
  weather report.

The full ruleset is in the skill; these are the ones you will be tempted by.

---

## 4. The loop: verify, red, and one honest question

```sh
cairn verify 01KZ4XGH
```

```
· running 1 proof…
· 01KZ5088  Empty the cart from the cart page  draft  draft is not proven yet

✗ 0 green · 1 red · 0 skipped
```

Exit code `1`. Note the status: **the draft stayed a draft**. `draft → broken`
does not exist — a stone that was never green has nothing to regress. The command
still fails, because a red proof is a red proof, but the registry does not
pretend a promise was broken.

Now the only question that matters, and it must never be guessed:

> **Is the proof wrong, or is the product wrong?**

- The failure is about **how the app was driven** — a control that does not exist
  under that name, the wrong entry point, a string the app never claimed to show,
  a race. **The proof is wrong.** The warden fixes its own spec. This costs
  nothing: it is not the coder's budget.
- The failure is about **what the app did** — the control is there, the journey
  works, but the promised outcome does not happen. **The product is wrong.** The
  warden stops touching the spec and writes a failure report. That consumes one
  attempt of three.

The self-deception to guard against: *"the button is called 'Valider' not
'Vider', I'll assert 'Valider'"* is fixing the proof. *"the total still shows
42 €, I'll assert 42 €"* is **falsifying** it. Never weaken a criterion to make
it pass.

### What the coder is allowed to see

```
STONE      01KZ4XGHGEXZ0DPYTA22QYVDHF — Empty the cart from the cart page
ATTEMPT    1 of 3

UNSATISFIED CRITERION
  "after emptying the cart, the cart page shows no article and a total of 0 €"

EXPECTED   the cart page shows no article, and a total of 0 €
OBSERVED   the cart page still lists 3 articles, and the total still reads 42 €
           (the page did not change after the cart was emptied)

TRACE      .cairn/runs/01KZ4XGHGEXZ0DPYTA22QYVDHF/attempt-1/trace.zip
SCREENSHOT .cairn/runs/01KZ4XGHGEXZ0DPYTA22QYVDHF/attempt-1/failure.png

SATISFIED  "the cart counter in the header shows 0"
```

And nothing else. Not the spec, not a selector, not the spec's filename, not a
Playwright stack trace, not a suggestion about which file to touch. A coder who
learns the selector writes code that satisfies the selector; a coder who learns
only the criterion writes code that satisfies the user. That difference is the
entire product.

The trace is the exception, and it is deliberate: it shows the *app*, which is
exactly what a coder needs and reveals nothing about how the promise is checked.

### The budget is three

An attempt is *(coder fixes the product) → verify → verdict*. There are three.
After the third red, no fourth is taken:

```sh
cairn escalate 01KZ4XGH --attempts 3 --tokens 187000
```

The stone moves to `escalated` — the one status a verify run will never move —
and the counters land in `provenance`, committed. The human gets the failure
report unchanged (so the escalation is auditable), the diff of all three
attempts, and the last trace, plus one sentence from the warden: either *"the
product does not do what this stone promises"* or *"this stone cannot be proven
as written"*. That sentence is what is being arbitrated.

Log every attempt as you go, one JSONL line per attempt in the git-ignored
`.cairn/runs/<ulid>.jsonl`:

```json
{"at":"2026-08-03T22:57:12.536Z","stone":"01KZ4XGH…","attempt":1,"actor":"warden","result":"red","criterion":"after emptying the cart, …","tokens":18420,"proofEdited":true}
```

A stone that went green in one attempt and a stone that cost three rounds and
200k tokens look identical in the registry unless you write them down. They are
not the same stone, and the difference is the product's unit economics.

---

## 5. Green

```sh
cairn verify 01KZ4XGH
```

```
· running 1 proof…
✓ 01KZ5088  Empty the cart from the cart page  draft → proven

✓ 1 green · 0 red · 0 skipped
```

```sh
cairn show 01KZ4XGH
```

```
✓ Empty the cart from the cart page
  01KZ5088F7QWNN332T2GV6QRQS

  status     proven
  created    2026-08-03T23:44:56.296Z (3m ago)
  surface    checkout
  file       .cairn/stones/01KZ5088F7QWNN332T2GV6QRQS.md
  proof      .cairn/proofs/01KZ5088F7QWNN332T2GV6QRQS.spec.ts
  integrity  match
  last green 2026-08-03T23:47:34.227Z proof 41627856ceca
```

`lastGreen` is the whole guarantee in three fields: **when** it was true, at
**which commit**, and the **sha256 of the exact proof file** that was green. From
this moment the spec is an artifact. Do not touch it. Any edit makes the
integrity audit fail until the stone is verified again — which is the point.

Commit the stone and the proof together.

---

## 6. What CI does with it, forever

Two jobs, both required in branch protection. Copy the template for your host
from [`packages/cli/templates/ci/`](../packages/cli/templates/ci):

```yaml
- run: cairn verify --all --proven-only     # the ratchet
- run: cairn verify --integrity --no-run    # the audit
```

**The ratchet** replays only the proofs of stones a human accepted and a warden
greened. Drafts are allowed to be red — they are not proven yet. Nothing that was
ever proven may regress, and there is no bypass flag. No model runs in this job:
it is Playwright replaying a file, which is why the guarantee is cheap enough to
run on every push.

**The audit** runs no browser at all. It compares the sha256 of every proof on
disk against the hash recorded on its stone:

```
✓ 01KZ5088  Empty the cart from the cart page  proven  run skipped (--no-run)
  integrity proof of 01KZ5088F7QWNN332T2GV6QRQS changed since the last green run (41627856ceca -> 4e82484dac0f)

✗ 0 green · 0 red · 2 skipped · 1 integrity failure(s)
```

Exit `1`. The cheat this defends against is mundane: an agent under pressure to
turn a red green edits the spec until it passes. A mismatch is never "update the
hash". It means either the warden legitimately reworked the proof — then
`cairn verify <id>` re-stamps it from a genuine green run — or somebody edited a
proof they do not own, which is a human conversation. Run the audit on session
end too; `SubagentStop` is the hook that catches it soonest
([docs/orchestration.md §4](./orchestration.md)).

When a proven stone does go red on a branch, that is
[`cairn-triage`](../.claude/skills/cairn-triage/SKILL.md)'s job: regression back
to the coder, or intent change drafted as an amendment for a human. The
18:40-with-a-red-pipeline version is [docs/ci.md](./ci.md).

---

## 7. When the promise changes

It will. Stones are **amended, never edited**:

```sh
echo '{
  "title": "Empty the cart from the cart page, with a confirmation",
  "acceptance": [
    "asking to empty the cart shows a confirmation before anything is removed",
    "after confirming, the cart page shows no article and a total of 0 €",
    "after cancelling, the cart still contains the same articles"
  ],
  "provenance": {"request": "je veux pouvoir vider mon panier…\n---\ntrop de gens vidaient leur panier par erreur, on demande confirmation"},
  "proof": true
}' | cairn amend 01KZ4XGH --json
```

The old stone retires with `amendedBy` set, a new draft points back through
`amends`, and the old proof leaves the active suite. Fields you omit — title,
surface, intent, even acceptance — are inherited.

Three habits that keep the lineage worth having:

- **Keep `provenance.request` verbatim** and append the new ask after a `---`
  line. The history of *why* is the thing a stone has that a test does not.
- **Never `--carry-proof` when the criteria changed.** The old proof was written
  against the old promise; a warden must write a new one from the new criteria —
  and it is not allowed to read the old one anyway.
- **Carry `attempts` and `tokens` forward** in the payload, or the cost of the
  previous round dies with the retired stone.

Until the new draft is proven, the behaviour is unproven. That is honest, and it
is visible in `cairn status`.

---

## Where to go next

- [`docs/orchestration.md`](./orchestration.md) — the permission model that makes
  both blindnesses real: deny rules, subagent tool lists, and the OS file modes
  underneath them. A denied tool call is a model choosing to comply; an `EACCES`
  is not a choice.
- [`docs/ci.md`](./ci.md) — the red-pipeline protocol, exit codes, flakiness
  policy.
- [`packages/mcp/README.md`](../packages/mcp/README.md) — the eight MCP tools, so
  your agents stop scraping terminal output.
- [`apps/desktop`](../apps/desktop) — review drafts and watch proofs in a window
  instead of a terminal.
