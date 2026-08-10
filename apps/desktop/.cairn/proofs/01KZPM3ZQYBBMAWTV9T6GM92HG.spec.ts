// Proof for 01KZPM3ZQYBBMAWTV9T6GM92HG — Voir l'activité des proofs sur l'année dès l'accueil
// Written by cairn-warden, blind to the implementation. Replayed in CI without
// an LLM. Do not edit by hand: amend the stone instead.
import { expect, test } from "@playwright/test";

test.describe(
  "Voir l'activité des proofs sur l'année dès l'accueil",
  { annotation: { type: "stone", description: "01KZPM3ZQYBBMAWTV9T6GM92HG" } },
  () => {
    test("en ouvrant l'application, la page d'accueil montre l'activité des proofs rejouées sur l'année, avec leur nombre total", async ({
      page,
    }) => {
      await page.goto("/");

      const activity = page.getByRole("region", { name: /Proof runs in \d{4}/ });
      await expect(activity).toBeVisible();
      await expect(activity.getByRole("heading", { name: "Proofs replayed" })).toBeVisible();
      await expect(activity.getByText(/\d+ in \d{4}/)).toBeVisible();
    });

    test("la page d'accueil indique combien de dépôts sont couverts", async ({ page }) => {
      await page.goto("/");

      const activity = page.getByRole("region", { name: /Proof runs in \d{4}/ });
      await expect(activity.getByText(/\d+ repositories/)).toBeVisible();
    });

    test("choisir un projet dans le filtre restreint l'activité affichée à ce seul projet", async ({
      page,
    }) => {
      await page.goto("/");

      const activity = page.getByRole("region", { name: /Proof runs in \d{4}/ });
      await expect(activity.getByText(/\d+ repositories/)).toBeVisible();

      await activity.getByRole("combobox", { name: "Project" }).selectOption("lantern-shop");

      await expect(activity.getByText(/\d+ in \d{4} · lantern-shop/)).toBeVisible();
      await expect(activity.getByText(/\d+ repositories/)).toHaveCount(0);
    });
  },
);
