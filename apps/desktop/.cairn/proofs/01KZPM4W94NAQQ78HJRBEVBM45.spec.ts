// Proof for 01KZPM4W94NAQQ78HJRBEVBM45 — Voir les escalations qui attendent un humain
// Written by cairn-warden, blind to the implementation. Replayed in CI without
// an LLM. Do not edit by hand: amend the stone instead.
import { expect, test } from "@playwright/test";

const WAITING_ESCALATIONS = [
  "The cart survives signing in halfway through",
  "Invoices can be downloaded as a document",
];

test.describe(
  "Voir les escalations qui attendent un humain",
  { annotation: { type: "stone", description: "01KZPM4W94NAQQ78HJRBEVBM45" } },
  () => {
    test("la section des escalations liste les stones qui attendent une décision humaine, avec leur titre", async ({
      page,
    }) => {
      await page.goto("/");

      await page
        .getByRole("navigation", { name: "Views" })
        .getByRole("button", { name: /^Escalations \d+$/ })
        .click();

      const escalations = page.getByRole("main");
      await expect(
        escalations.getByRole("heading", { name: "Escalations", exact: true }),
      ).toBeVisible();
      await expect(escalations.getByRole("article")).toHaveCount(WAITING_ESCALATIONS.length);
      for (const title of WAITING_ESCALATIONS) {
        await expect(escalations.getByRole("heading", { name: title, exact: true })).toBeVisible();
      }
    });

    test("le nombre d'escalations en attente est visible depuis la navigation", async ({ page }) => {
      await page.goto("/");

      await expect(
        page
          .getByRole("navigation", { name: "Views" })
          .getByRole("button", { name: `Escalations ${WAITING_ESCALATIONS.length}`, exact: true }),
      ).toBeVisible();
    });
  },
);
