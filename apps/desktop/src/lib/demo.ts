/**
 * DemoSource — an in-memory cairn, used automatically when the app runs in a
 * plain browser (`pnpm dev`) instead of inside Tauri.
 *
 * The point is design review: every screen must be reachable and full without
 * Tauri, a Rust toolchain or a real repository. The data is fabricated, and the
 * app says so (the sidebar tags the source `demo`).
 *
 * The demo stones are written as real stone files — serialized with
 * @usecairn/core's `serializeStone` and read back with `parseStoneFile` — so the
 * browser exercises exactly the parser the CLI uses.
 */

import { parseStoneFile, serializeStone } from "@usecairn/core/stone-parse";
import type { Stone, StoneInput } from "@usecairn/core/schema";
import type {
  CairnSnapshot,
  CairnSource,
  FailureReport,
  RunRecord,
  StoneRecord,
  VerifyEvent,
  VerifyOptions,
  VerifyOutcome,
} from "./cairn.js";

export const DEMO_ROOT = "/Users/you/code/lantern-shop";

/**
 * Two more repositories, so the home screen has something to aggregate and the
 * project filter has something to filter. They carry a slice of the same
 * stones and their own run history — enough to be reviewable, not a second
 * fixture set to maintain.
 */
export const DEMO_ROOTS = [DEMO_ROOT, "/Users/you/code/atlas-crm", "/Users/you/code/harbor-docs"];

/* --------------------------------------------------------------- fixtures */

const A1 = "01KQS44ER0N2YEWE9ZJAB9HCPV";
const A2 = "01KR126B00RGA2JM6R0P2XQKKF";
const A3 = "01KRXT9PG0JVCYSBR63HWS957E";

interface Seed {
  stone: StoneInput;
  body: string;
}

function iso(day: string): string {
  return `2026-${day}T09:12:00.000Z`;
}

const SEEDS: Seed[] = [
  {
    stone: {
      id: A1,
      title: "Guests can check out without an account",
      status: "retired",
      createdAt: iso("05-04"),
      surface: "checkout",
      amends: null,
      amendedBy: A2,
      acceptance: [
        "A shopper who is not signed in can reach the payment step from the cart.",
        "The shopper is never asked to create a password to finish the order.",
        "After paying, the shopper sees a confirmation with the order number.",
      ],
      provenance: {
        request:
          "people keep dropping off at the account wall. let guests buy without making an account, we can ask them to register afterwards",
        attempts: 2,
        tokens: 18420,
      },
      lastGreen: { at: iso("05-06"), commit: "9f2c1ad", proofHash: "b41f7c9e5a2d" },
      proof: ".cairn/proofs/01KQS44ER0N2YEWE9ZJAB9HCPV.spec.ts",
    },
    body: "A shopper who arrives with a full cart should be able to pay without being stopped by a sign-up form. Asking for an account before the money is taken is where we lose people.",
  },
  {
    stone: {
      id: A2,
      title: "Guests can check out without an account, and are offered one afterwards",
      status: "retired",
      createdAt: iso("05-07"),
      surface: "checkout",
      amends: A1,
      amendedBy: A3,
      acceptance: [
        "A shopper who is not signed in can reach the payment step from the cart.",
        "The shopper is never asked to create a password to finish the order.",
        "After paying, the shopper is offered, not required, to keep an account with the address they just used.",
      ],
      provenance: {
        request:
          "same as before but after the order we should offer to save the details as an account. offer, not force",
        attempts: 1,
        tokens: 9110,
      },
      lastGreen: { at: iso("05-09"), commit: "c07be34", proofHash: "1d90a7f22c48" },
      proof: ".cairn/proofs/01KR126B00RGA2JM6R0P2XQKKF.spec.ts",
    },
    body: "Same intent as the stone it amends, with the post-purchase offer made explicit: the account is a courtesy at the end, never a gate at the start.",
  },
  {
    stone: {
      id: A3,
      title: "Guest checkout, with an optional account offered after payment",
      status: "proven",
      createdAt: iso("05-18"),
      surface: "checkout",
      amends: A2,
      amendedBy: null,
      acceptance: [
        "A shopper who is not signed in can reach the payment step from the cart.",
        "The shopper is never asked to create a password to finish the order.",
        "After paying, the shopper is offered, not required, to keep an account with the address they just used.",
        "Declining the offer still leaves the shopper on the confirmation, with the order number visible.",
      ],
      provenance: {
        request:
          "one more thing: if they say no to the account offer they should stay on the confirmation page, not get bounced to the home page",
        attempts: 1,
        tokens: 7350,
      },
      lastGreen: { at: iso("06-11"), commit: "4ab9d02", proofHash: "77c1e9b03fa5" },
      proof: ".cairn/proofs/01KRXT9PG0JVCYSBR63HWS957E.spec.ts",
    },
    body: "The current stone of the guest-checkout lineage. Declining the account offer is part of the intent now: saying no must not cost the shopper the confirmation.",
  },
  {
    stone: {
      id: "01KQYCBRC0ZQ4R6KTJKHHV96Y3",
      title: "A signed-in shopper sees their saved addresses at checkout",
      status: "proven",
      createdAt: iso("05-06"),
      surface: "checkout",
      amends: null,
      amendedBy: null,
      acceptance: [
        "A shopper who is signed in and has ordered before sees their previous delivery address already filled in.",
        "The shopper can pick a different saved address without retyping it.",
        "Editing the address for this order does not change the saved one.",
      ],
      provenance: {
        request:
          "returning customers shouldn't retype their address every time. show the ones they've used before",
        attempts: 1,
        tokens: 6240,
      },
      lastGreen: { at: iso("06-11"), commit: "4ab9d02", proofHash: "2ef4c81b90aa" },
      proof: ".cairn/proofs/01KQYCBRC0ZQ4R6KTJKHHV96Y3.spec.ts",
    },
    body: "Address re-entry is the most complained-about step in the funnel. A returning shopper should recognise their own address before they read anything else on the page.",
  },
  {
    stone: {
      id: "01KR8WTBM0DQDDGBTKJX9J6B61",
      title: "Search results say how many matches there are",
      status: "proven",
      createdAt: iso("05-10"),
      surface: "search",
      amends: null,
      amendedBy: null,
      acceptance: [
        "Searching for a word that matches several products shows how many were found.",
        "Searching for something that matches nothing says so in plain words, and suggests clearing the filters.",
      ],
      provenance: {
        request: "the search page should tell you how many results you got. and say something useful when there are none",
        attempts: 1,
        tokens: 4180,
      },
      lastGreen: { at: iso("06-11"), commit: "4ab9d02", proofHash: "5b0dd7a11c36" },
      proof: ".cairn/proofs/01KR8WTBM0DQDDGBTKJX9J6B61.spec.ts",
    },
    body: "A result count is how a shopper decides whether to refine or to start scrolling. Without it the page reads as an unbounded list.",
  },
  {
    stone: {
      id: "01KRGQEC807J14RB9KAEV1YJ2A",
      title: "A password reset link stops working after an hour",
      status: "broken",
      createdAt: iso("05-13"),
      surface: "auth",
      amends: null,
      amendedBy: null,
      acceptance: [
        "A reset link opened within the hour lets the person choose a new password.",
        "A reset link opened more than an hour after it was sent says it has expired and offers to send a new one.",
        "Using a link a second time, after the password was already changed, is refused.",
      ],
      provenance: {
        request: "security review says reset links live too long. they should die after an hour and be single use",
        attempts: 3,
        tokens: 22890,
      },
      lastGreen: { at: iso("05-29"), commit: "77de410", proofHash: "aa3190f8b7c2" },
      proof: ".cairn/proofs/01KRGQEC807J14RB9KAEV1YJ2A.spec.ts",
    },
    body: "This one was proven and went red on the 12th of June: the expiry branch stopped being reachable after the mail template changed.",
  },
  {
    stone: {
      id: "01KRNZNNW0DRBKNFK6PWAMNJT3",
      title: "The cart survives signing in halfway through",
      status: "escalated",
      createdAt: iso("05-15"),
      surface: "checkout",
      amends: null,
      amendedBy: null,
      acceptance: [
        "A shopper who fills a cart while signed out, then signs in, still has every item in the cart.",
        "If the same shopper already had items saved from an earlier visit, both sets are kept together.",
        "Quantities are not doubled when the two carts are joined.",
      ],
      provenance: {
        request:
          "when you sign in mid-checkout your cart gets wiped. that's the bug people email us about. it should merge with whatever was already saved",
        attempts: 3,
        tokens: 41250,
      },
      lastGreen: null,
      proof: ".cairn/proofs/01KRNZNNW0DRBKNFK6PWAMNJT3.spec.ts",
    },
    body: "Losing a cart at the sign-in step is the single worst moment in the product. The merge has to be boring and predictable: nothing lost, nothing doubled.",
  },
  {
    stone: {
      id: "01KS5MXQ40TW3SX96MSB6RC539",
      title: "A mistyped card says which field is wrong",
      status: "draft",
      createdAt: iso("05-21"),
      surface: "billing",
      amends: null,
      amendedBy: null,
      acceptance: [
        "Entering a card number that is one digit short points at the card number, not at the form as a whole.",
        "An expiry date in the past is called out on the expiry field.",
        "The shopper keeps everything else they had already typed.",
      ],
      provenance: {
        request:
          "payment errors are useless right now, it just says 'payment failed'. tell people which bit they got wrong and don't clear the form",
      },
      lastGreen: null,
      proof: null,
    },
    body: "A failed payment is a moment of panic. The screen should point at the one thing to fix and keep everything else the shopper typed.",
  },
  {
    stone: {
      id: "01KSAX50R0S9EZ8R4JCKMSVZXZ",
      title: "A shopper can remove a line from the cart",
      status: "draft",
      createdAt: iso("05-23"),
      surface: "checkout",
      amends: null,
      amendedBy: null,
      acceptance: [
        "Removing a line takes it out of the cart and updates the total.",
        "Removing the last line leaves the shopper on an empty cart that says what to do next.",
        "Removing a line can be undone straight away.",
      ],
      provenance: {
        request: "you can add to the cart but removing is fiddly. one clear remove per line, and let them undo it",
      },
      lastGreen: null,
      proof: null,
    },
    body: "Removing should be as cheap as adding, and reversible: the undo is what makes people comfortable enough to try.",
  },
  {
    stone: {
      id: "01KSJQS1C0TG8X980KJCFJ25TP",
      title: "The confirmation shows an order number the shopper can quote",
      status: "proven",
      createdAt: iso("05-26"),
      surface: "checkout",
      amends: null,
      amendedBy: null,
      acceptance: [
        "After paying, the shopper sees an order number on the confirmation.",
        "The same order number appears in the confirmation email.",
        "Support can find the order from that number alone.",
      ],
      provenance: {
        request: "support can't find orders from what customers read out to them. put one number on the page and in the email",
        attempts: 2,
        tokens: 11020,
      },
      lastGreen: { at: iso("06-11"), commit: "4ab9d02", proofHash: "c9814bb7e230" },
      proof: ".cairn/proofs/01KSJQS1C0TG8X980KJCFJ25TP.spec.ts",
    },
    body: "One number, in two places, that support can search. That is the whole feature.",
  },
  {
    stone: {
      id: "01KSR00B00MAF1994VYDM3HYYJ",
      title: "New team-mates land on a first-run checklist",
      status: "draft",
      createdAt: iso("05-28"),
      surface: "onboarding",
      amends: null,
      amendedBy: null,
      acceptance: [
        "Someone opening the shop admin for the first time sees a short list of what to set up.",
        "Each item on the list can be marked done, and stays done on the next visit.",
        "The list disappears once everything on it is done.",
      ],
      provenance: {
        request:
          "new staff have no idea what to configure first. give them a checklist on first login, and let it go away when they're done",
      },
      lastGreen: null,
      proof: null,
    },
    body: "The checklist is a teaching device, not a permanent fixture: it earns its place by disappearing.",
  },
  {
    stone: {
      id: "01KSZTMBM0CAFR4N0X2A7RMAGE",
      title: "Invoices can be downloaded as a document",
      status: "escalated",
      createdAt: iso("05-31"),
      surface: "billing",
      amends: null,
      amendedBy: null,
      acceptance: [
        "A shopper looking at a past order can download its invoice.",
        "The downloaded invoice shows the same total the shopper paid.",
        "An order that has not been paid yet offers no invoice.",
      ],
      provenance: {
        request: "business customers need a proper invoice they can hand to their accountant",
        attempts: 3,
        tokens: 33740,
      },
      lastGreen: null,
      proof: ".cairn/proofs/01KSZTMBM0CAFR4N0X2A7RMAGE.spec.ts",
    },
    body: "An invoice is a document someone else will read: the accountant, not the shopper. It has to be right rather than pretty.",
  },
  {
    stone: {
      id: "01KT52VN80QMYQFSH19DRP2F24",
      title: "Signing out ends the session everywhere",
      status: "broken",
      createdAt: iso("06-02"),
      surface: "auth",
      amends: null,
      amendedBy: null,
      acceptance: [
        "Signing out on one device also signs the person out on the others.",
        "Coming back to a page that was already open asks them to sign in again.",
      ],
      provenance: {
        request: "if I sign out on my laptop my phone should be signed out too",
        attempts: 1,
        tokens: 5980,
      },
      lastGreen: { at: iso("06-04"), commit: "1c88b7f", proofHash: "e02ab6d4139f" },
      proof: ".cairn/proofs/01KT52VN80QMYQFSH19DRP2F24.spec.ts",
    },
    body: "Went red with the session-store change on the 12th. The second criterion is the one that fails.",
  },
  {
    stone: {
      id: "01KTFFWCW0JQMN46NGXQP9912Q",
      title: "Going back to the catalogue keeps the filters",
      status: "draft",
      createdAt: iso("06-06"),
      surface: "search",
      amends: null,
      amendedBy: null,
      acceptance: [
        "A shopper who filters the catalogue, opens a product, then goes back still sees the same filtered list.",
        "The list is scrolled to where they left it.",
      ],
      provenance: {
        request: "going back from a product resets all the filters, it's maddening. keep them, and the scroll position too",
      },
      lastGreen: null,
      proof: null,
    },
    body: "Back should be an undo, not a reset. Losing a carefully built filter set is what makes people give up browsing.",
  },
  {
    stone: {
      id: "01KTQAGDG070FY4KEBHQNM11Z6",
      title: "The weekly digest email goes out on Mondays",
      status: "retired",
      createdAt: iso("06-09"),
      surface: "notifications",
      amends: null,
      amendedBy: null,
      acceptance: [
        "Someone subscribed to the digest gets one email at the start of the week.",
        "Someone who unsubscribed gets nothing.",
      ],
      provenance: {
        request: "weekly summary email on monday mornings for people who opted in",
        attempts: 1,
        tokens: 3110,
      },
      lastGreen: { at: iso("06-10"), commit: "0d31c98", proofHash: "6a5b2c0ff781" },
      proof: ".cairn/proofs/01KTQAGDG070FY4KEBHQNM11Z6.spec.ts",
    },
    body: "Retired on the 20th of June: the digest was dropped in favour of in-app notifications. Kept for the record, never run again.",
  },
  {
    stone: {
      id: "01KTWJQQ40S868Q60BY0BXR0A0",
      title: "A failed verify names the first stone that broke",
      status: "draft",
      createdAt: iso("06-12"),
      surface: "cli",
      amends: null,
      amendedBy: null,
      acceptance: [
        "When several proofs fail at once, the summary names the first one that failed.",
        "The summary is readable without scrolling back through the whole run.",
      ],
      provenance: {
        request: "when a bunch of proofs go red I can't tell which one went first. put it at the end of the run",
      },
      lastGreen: null,
      proof: null,
    },
    body: "Reading a red run is triage. The first failure is usually the cause and the rest is noise.",
  },
];

/* ------------------------------------------------------------- demo files */

const STONE_FILES = new Map<string, string>();
for (const seed of SEEDS) {
  const id = seed.stone.id;
  STONE_FILES.set(`.cairn/stones/${id}.md`, serializeStone(seed.stone, seed.body));
}

function proofSource(stone: Stone): string {
  const criteria = stone.acceptance
    .map(
      (line, index) => `  await test.step(${JSON.stringify(line)}, async () => {
    // criterion ${index + 1}
    await expect(page.getByRole("region", { name: "confirmation" })).toBeVisible();
  });`,
    )
    .join("\n\n");

  return `// Proof for ${stone.id}: ${stone.title}
// Written by cairn-warden, blind to the implementation. Replayed in CI without
// an LLM. Do not edit by hand: amend the stone instead.
import { expect, test } from "@playwright/test";

test(${JSON.stringify(stone.title)}, async ({ page }) => {
  await page.goto("/");

${criteria}
});
`;
}

const PROOF_FILES = new Map<string, string>();
for (const seed of SEEDS) {
  if (!seed.stone.proof) continue;
  const parsed = parseStoneFile(STONE_FILES.get(`.cairn/stones/${seed.stone.id}.md`) ?? "");
  PROOF_FILES.set(seed.stone.proof, proofSource(parsed.stone));
}

const REPORTS: Record<string, FailureReport> = {
  "01KRNZNNW0DRBKNFK6PWAMNJT3": {
    at: "2026-06-12T16:41:09.000Z",
    attempts: 3,
    summary:
      "The signed-out cart is replaced by the saved cart instead of being merged with it. Three attempts, same failure each time.",
    expected:
      "After signing in, the cart holds the two items added while signed out plus the one item saved from the earlier visit: three lines, no quantity doubled.",
    actual:
      "After signing in, the cart holds only the one item saved from the earlier visit. The two items added while signed out are gone.",
    step: 'expect(cart).toHaveCount(3), received 1\n  at .cairn/proofs/01KRNZNNW0DRBKNFK6PWAMNJT3.spec.ts:34',
    trace: ".cairn/traces/01KRNZNNW0DRBKNFK6PWAMNJT3-attempt-3.zip",
    diff: `--- a/src/checkout/session.ts
+++ b/src/checkout/session.ts
@@ -41,9 +41,14 @@ export async function adoptGuestCart(userId: string, guestId: string) {
-  const saved = await carts.forUser(userId);
-  if (saved) {
-    await carts.drop(guestId);
-    return saved;
-  }
+  const saved = await carts.forUser(userId);
+  const guest = await carts.forGuest(guestId);
+  if (saved && guest) {
+    // attempt 3: still returns \`saved\` untouched on the merge path
+    return saved;
+  }
   return carts.claim(guestId, userId);
 }`,
  },
};

/* ------------------------------------------------------------- demo runs */

/**
 * A year of history, so the home heatmap has something to show.
 *
 * Deterministic on purpose — a seeded LCG, not Math.random — so two launches
 * of the demo draw the same map and a screenshot stays comparable. The shape
 * is the one a real project has: dense on weekdays, quiet at weekends, a
 * fortnight of holiday, and a rough patch in the spring where the reds cluster.
 */
function syntheticRuns(startSeed = 20260612, density = 1): RunRecord[] {
  const ids = SEEDS.map((seed) => seed.stone.id);
  const rows: RunRecord[] = [];
  let seed = startSeed;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  // Two calendar years, so the year filter has more than one thing to pick.
  for (let back = 700; back >= 3; back -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - back);
    const weekday = day.getDay();
    const isWeekend = weekday === 0 || weekday === 6;

    // a fortnight off, 17 weeks ago
    if (back <= 126 && back >= 112) continue;
    // most weekends are quiet
    if (isWeekend && rand() > 0.22 * density) continue;
    if (!isWeekend && rand() > 0.86 * density) continue;

    const runs = isWeekend ? 1 + Math.floor(rand() * 3) : 2 + Math.floor(rand() * 11);
    // the spring rough patch: proofs go red far more often
    const roughPatch = back <= 250 && back >= 205;
    const redChance = roughPatch ? 0.42 : 0.04;

    for (let i = 0; i < runs; i += 1) {
      const at = new Date(day);
      at.setHours(9 + Math.floor(rand() * 9), Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
      const red = rand() < redChance;
      rows.push({
        id: `s-${startSeed}-${back}-${i}`,
        stoneId: ids[Math.floor(rand() * ids.length)] ?? null,
        at: at.toISOString(),
        verdict: red ? "red" : "green",
        durationMs: 1800 + Math.floor(rand() * 9000),
      });
    }
  }

  return rows;
}

const RECENT_RUNS: RunRecord[] = [
  { id: "r-014", stoneId: "01KRNZNNW0DRBKNFK6PWAMNJT3", at: "2026-06-12T16:41:09.000Z", verdict: "red", durationMs: 8420 },
  { id: "r-013", stoneId: "01KT52VN80QMYQFSH19DRP2F24", at: "2026-06-12T16:40:55.000Z", verdict: "red", durationMs: 3110 },
  { id: "r-012", stoneId: "01KRGQEC807J14RB9KAEV1YJ2A", at: "2026-06-12T16:40:44.000Z", verdict: "red", durationMs: 5240 },
  { id: "r-011", stoneId: "01KRXT9PG0JVCYSBR63HWS957E", at: "2026-06-11T09:02:31.000Z", verdict: "green", durationMs: 6180, commit: "4ab9d02" },
  { id: "r-010", stoneId: "01KQYCBRC0ZQ4R6KTJKHHV96Y3", at: "2026-06-11T09:02:24.000Z", verdict: "green", durationMs: 4020, commit: "4ab9d02" },
  { id: "r-009", stoneId: "01KR8WTBM0DQDDGBTKJX9J6B61", at: "2026-06-11T09:02:18.000Z", verdict: "green", durationMs: 2870, commit: "4ab9d02" },
  { id: "r-008", stoneId: "01KSJQS1C0TG8X980KJCFJ25TP", at: "2026-06-11T09:02:09.000Z", verdict: "green", durationMs: 5330, commit: "4ab9d02" },
  { id: "r-007", stoneId: "01KRNZNNW0DRBKNFK6PWAMNJT3", at: "2026-06-10T18:22:40.000Z", verdict: "red", durationMs: 8710 },
  { id: "r-006", stoneId: "01KSZTMBM0CAFR4N0X2A7RMAGE", at: "2026-06-10T18:22:12.000Z", verdict: "red", durationMs: 9930 },
  { id: "r-005", stoneId: "01KRGQEC807J14RB9KAEV1YJ2A", at: "2026-05-29T11:14:02.000Z", verdict: "green", durationMs: 5010, commit: "77de410" },
  { id: "r-004", stoneId: "01KT52VN80QMYQFSH19DRP2F24", at: "2026-06-04T14:31:55.000Z", verdict: "green", durationMs: 2990, commit: "1c88b7f" },
  { id: "r-003", stoneId: "01KRNZNNW0DRBKNFK6PWAMNJT3", at: "2026-06-09T10:08:19.000Z", verdict: "red", durationMs: 8090 },
  { id: "r-002", stoneId: "01KTQAGDG070FY4KEBHQNM11Z6", at: "2026-06-10T07:45:03.000Z", verdict: "green", durationMs: 1980, commit: "0d31c98" },
  { id: "r-001", stoneId: "01KSZTMBM0CAFR4N0X2A7RMAGE", at: "2026-06-09T10:07:44.000Z", verdict: "red", durationMs: 10240 },
];

/** The hand-written recent rows the other views quote, over a year of history. */
const RUNS: RunRecord[] = [...RECENT_RUNS, ...syntheticRuns()];

const VERIFY_TRANSCRIPT: string[] = [
  "$ pnpm exec playwright test --reporter=line",
  "",
  "Running 11 proofs with 4 workers",
  "",
  "  ok  1 …01KQYCBRC0ZQ4R6KTJKHHV96Y3 › A signed-in shopper sees their saved addresses at checkout (4.0s)",
  "  ok  2 …01KR8WTBM0DQDDGBTKJX9J6B61 › Search results say how many matches there are (2.9s)",
  "  ok  3 …01KRXT9PG0JVCYSBR63HWS957E › Guest checkout, with an optional account offered after payment (6.2s)",
  "  ok  4 …01KSJQS1C0TG8X980KJCFJ25TP › The confirmation shows an order number the shopper can quote (5.3s)",
  "",
  "  1) …01KRGQEC807J14RB9KAEV1YJ2A › A password reset link stops working after an hour",
  "",
  "    Error: expect(received).toBeVisible()",
  "    Expected: visible",
  "    Received: hidden",
  "      at .cairn/proofs/01KRGQEC807J14RB9KAEV1YJ2A.spec.ts:28",
  "",
  "  2) …01KT52VN80QMYQFSH19DRP2F24 › Signing out ends the session everywhere",
  "",
  "    Error: expect(received).toHaveText(expected)",
  "      at .cairn/proofs/01KT52VN80QMYQFSH19DRP2F24.spec.ts:19",
  "",
  "  2 failed, 4 passed, 5 skipped (18.6s)",
  "",
  "cairn: 2 stones went red, 01KRGQEC80 broke first",
];

/* ------------------------------------------------------------ the source */

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class DemoSource implements CairnSource {
  readonly kind = "demo" as const;
  readonly label = "demo";

  async pickRepo(): Promise<string | null> {
    // No filesystem in a plain browser. The desktop build opens a real picker.
    return null;
  }

  initialRepos(): string[] {
    return [...DEMO_ROOTS];
  }

  async readCairn(root: string): Promise<CairnSnapshot> {
    await delay(120); // enough to see the loading state, not enough to annoy
    const stones: StoneRecord[] = [];
    for (const [path, content] of STONE_FILES) {
      const parsed = parseStoneFile(content, path);
      stones.push({ stone: parsed.stone, body: parsed.body, path });
    }
    stones.sort((a, b) => (a.stone.id < b.stone.id ? -1 : 1));

    // The secondary repos are smaller and quieter: a slice of the stones and
    // their own year of runs, seeded from the root so each one has a shape.
    const index = DEMO_ROOTS.indexOf(root);
    const name = root.split("/").pop() ?? "cairn";
    if (index > 0) {
      const slice = stones.filter((_, i) => i % (index + 1) === 0);
      return {
        root,
        name,
        stones: slice,
        unreadable: [],
        config: {
          baseURL: `http://localhost:${4321 + index}`,
          proofsDir: ".cairn/proofs",
          stonesDir: ".cairn/stones",
          start: "pnpm dev",
          retries: 1,
        },
        runs: syntheticRuns(9_000_000 * (index + 1), 0.55 / index),
        reports: {},
        readAt: new Date().toISOString(),
      };
    }

    return {
      root,
      name: "lantern-shop",
      stones,
      unreadable: [],
      config: {
        baseURL: "http://localhost:4321",
        proofsDir: ".cairn/proofs",
        stonesDir: ".cairn/stones",
        start: "pnpm dev --port 4321",
        setup: "pnpm seed:demo",
        retries: 1,
      },
      runs: RUNS,
      reports: REPORTS,
      readAt: new Date().toISOString(),
    };
  }

  async readProof(_root: string, proofPath: string): Promise<string> {
    await delay(60);
    const content = PROOF_FILES.get(proofPath);
    if (content === undefined) throw new Error(`No proof at ${proofPath}`);
    return content;
  }

  async runVerify(
    options: VerifyOptions,
    onEvent: (event: VerifyEvent) => void,
  ): Promise<VerifyOutcome> {
    const runId = `demo-${Date.now().toString(36)}`;
    const started = Date.now();
    const scope = options.ids?.length ? options.ids.join(" ") : "";
    const command = `cairn verify${scope ? ` ${scope}` : ""}${options.provenOnly ? " --proven-only" : ""}`;
    onEvent({ type: "start", runId, command });

    for (const line of VERIFY_TRANSCRIPT) {
      await delay(line === "" ? 40 : 180);
      onEvent({ type: "line", runId, line });
    }
    const code = 1; // the demo cairn is unhappy — that is the interesting screen
    onEvent({ type: "end", runId, code });
    return { runId, code, durationMs: Date.now() - started };
  }

  async watch(_root: string, _onChange: () => void): Promise<() => void> {
    // Nothing changes on its own in the demo.
    return () => {};
  }
}
