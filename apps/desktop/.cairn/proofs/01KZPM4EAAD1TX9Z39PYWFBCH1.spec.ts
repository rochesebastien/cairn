// Proof for 01KZPM4EAAD1TX9Z39PYWFBCH1 — Passer en revue les drafts en attente
// Written by cairn-warden, blind to the implementation. Replayed in CI without
// an LLM. Do not edit by hand: amend the stone instead.
import { expect, test } from "@playwright/test";

const WAITING_DRAFTS = [
  "A mistyped card says which field is wrong",
  "A shopper can remove a line from the cart",
  "New team-mates land on a first-run checklist",
  "Going back to the catalogue keeps the filters",
  "A failed verify names the first stone that broke",
];

test.describe(
  "Passer en revue les drafts en attente",
  { annotation: { type: "stone", description: "01KZPM4EAAD1TX9Z39PYWFBCH1" } },
  () => {
    test("la section de revue liste les stones en attente de décision, avec leur titre", async ({
      page,
    }) => {
      await page.goto("/");

      await page
        .getByRole("navigation", { name: "Views" })
        .getByRole("button", { name: /^Review \d+$/ })
        .click();

      const review = page.getByRole("main");
      await expect(review.getByRole("heading", { name: "Review", exact: true })).toBeVisible();
      await expect(review.getByRole("article")).toHaveCount(WAITING_DRAFTS.length);
      for (const title of WAITING_DRAFTS) {
        await expect(review.getByRole("heading", { name: title, exact: true })).toBeVisible();
      }
    });

    test("le nombre de stones à revoir est visible depuis la navigation", async ({ page }) => {
      await page.goto("/");

      await expect(
        page
          .getByRole("navigation", { name: "Views" })
          .getByRole("button", { name: `Review ${WAITING_DRAFTS.length}`, exact: true }),
      ).toBeVisible();
    });
  },
);
