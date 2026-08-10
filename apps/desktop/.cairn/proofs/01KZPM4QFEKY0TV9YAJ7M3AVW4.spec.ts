// Proof for 01KZPM4QFEKY0TV9YAJ7M3AVW4 — Utiliser l'interface en français
// Written by cairn-warden, blind to the implementation. Replayed in CI without
// an LLM. Do not edit by hand: amend the stone instead.
import { expect, test } from "@playwright/test";

test.describe(
  "Utiliser l'interface en français",
  { annotation: { type: "stone", description: "01KZPM4QFEKY0TV9YAJ7M3AVW4" } },
  () => {
    test("l'application s'ouvre avec une interface en anglais", async ({ page }) => {
      await page.goto("/");

      await expect(page.getByRole("navigation", { name: "Views" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Proofs replayed" })).toBeVisible();
    });

    test("après avoir choisi le français dans les réglages, l'interface s'affiche en français", async ({
      page,
    }) => {
      await page.goto("/");

      await page.getByRole("button", { name: "Settings", exact: true }).click();
      const settings = page.getByRole("dialog", { name: "Settings" });
      await settings.getByRole("button", { name: "Language", exact: true }).click();
      await settings.getByRole("button", { name: "Français", exact: true }).click();

      await expect(page.getByRole("navigation", { name: "Vues" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Paramètres", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Proofs rejouées" })).toBeVisible();
    });
  },
);
