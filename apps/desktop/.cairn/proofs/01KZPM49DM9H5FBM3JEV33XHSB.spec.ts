// Proof for 01KZPM49DM9H5FBM3JEV33XHSB — Retrouver une stone par la recherche
// Written by cairn-warden, blind to the implementation. Replayed in CI without
// an LLM. Do not edit by hand: amend the stone instead.
import { expect, test } from "@playwright/test";

const STONE_TITLE = "A signed-in shopper sees their saved addresses at checkout";

test.describe(
  "Retrouver une stone par la recherche",
  { annotation: { type: "stone", description: "01KZPM49DM9H5FBM3JEV33XHSB" } },
  () => {
    test("la recherche peut s'ouvrir au clavier, sans passer par la souris", async ({ page }) => {
      await page.goto("/");

      await page.keyboard.press("Control+k");

      await expect(page.getByRole("dialog", { name: "Search the cairn" })).toBeVisible();
    });

    test("taper une partie du titre d'une stone affiche cette stone dans les résultats", async ({
      page,
    }) => {
      await page.goto("/");

      await page.keyboard.press("Control+k");
      const search = page.getByRole("dialog", { name: "Search the cairn" });
      await search.getByRole("textbox", { name: "Search" }).fill("saved addresses");

      await expect(search.getByRole("button", { name: new RegExp(STONE_TITLE) })).toBeVisible();
    });

    test("choisir un résultat ouvre la stone correspondante", async ({ page }) => {
      await page.goto("/");

      await page.keyboard.press("Control+k");
      const search = page.getByRole("dialog", { name: "Search the cairn" });
      await search.getByRole("textbox", { name: "Search" }).fill("saved addresses");
      await search.getByRole("button", { name: new RegExp(STONE_TITLE) }).click();

      await expect(page.getByRole("dialog", { name: STONE_TITLE })).toBeVisible();
    });
  },
);
