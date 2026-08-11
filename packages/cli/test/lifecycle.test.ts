import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isUlid, type Stone } from "@usecairn/core";
import { cli, makeProject, seedStone, type TempProject } from "./helpers.js";

/**
 * The path a stone walks: init → add → list → show → amend → status.
 * Every command runs against a real temp directory.
 */
describe("cairn lifecycle", () => {
  let project: TempProject;

  beforeEach(async () => {
    project = await makeProject();
    await cli(["init"], { cwd: project.root });
  });

  afterEach(async () => {
    await project.cleanup();
  });

  describe("init", () => {
    it("creates the cairn, the config and the run-artifact gitignore", async () => {
      await expect(project.read(".cairn", ".gitignore")).resolves.toContain("runs/");
      const config = await project.read("cairn.config.ts");
      expect(config).toContain("baseURL");
      expect(config).toContain("start");
      expect(config).toContain("retries");
      expect(config).toContain("setup");

      const { stat } = await import("node:fs/promises");
      expect((await stat(project.path(".cairn", "stones"))).isDirectory()).toBe(true);
      expect((await stat(project.path(".cairn", "proofs"))).isDirectory()).toBe(true);
    });

    it("is idempotent and never rewrites an edited config", async () => {
      await project.write("cairn.config.ts", 'export default { baseURL: "http://localhost:4242" };');
      const second = await cli(["init"], { cwd: project.root });

      expect(second.code).toBe(0);
      expect(second.stdout).toContain("already standing");
      await expect(project.read("cairn.config.ts")).resolves.toContain("4242");
    });

    it("rewrites the config when forced", async () => {
      await project.write("cairn.config.ts", 'export default { baseURL: "http://localhost:4242" };');
      await cli(["init", "--force"], { cwd: project.root });
      await expect(project.read("cairn.config.ts")).resolves.toContain("localhost:3000");
    });

    it("reports what it did in JSON", async () => {
      const result = await cli(["init", "--json"], { cwd: project.root });
      const payload = result.json<{ ok: boolean; entries: Array<{ path: string; created: boolean }> }>();

      expect(payload.ok).toBe(true);
      expect(payload.entries.map((entry) => entry.path)).toContain(".cairn/stones");
      expect(payload.entries.every((entry) => entry.created === false)).toBe(true);
    });
  });

  describe("add", () => {
    it("writes a draft stone with provenance kept verbatim", async () => {
      const result = await cli(
        [
          "add",
          "--title",
          "Le panier affiche le total",
          "--intent",
          "# Why\n\nShoppers abandon carts when the total is a surprise.",
          "--acceptance",
          "the shopper sees the total including tax",
          "--acceptance",
          "the total updates when the quantity changes",
          "--surface",
          "checkout",
          "--request",
          "je veux voir le total dans le panier, taxes comprises",
        ],
        { cwd: project.root },
      );

      expect(result.code).toBe(0);
      const id = /id\s+([0-9A-Z]{26})/.exec(result.stdout)?.[1];
      expect(id && isUlid(id)).toBe(true);

      const { stone, body } = await project.stone(id as string);
      expect(stone.status).toBe("draft");
      expect(stone.title).toBe("Le panier affiche le total");
      expect(stone.surface).toBe("checkout");
      expect(stone.acceptance).toHaveLength(2);
      expect(stone.provenance.request).toBe("je veux voir le total dans le panier, taxes comprises");
      expect(stone.lastGreen).toBeNull();
      expect(stone.proof).toBeNull();
      expect(stone.amends).toBeNull();
      expect(body).toContain("Shoppers abandon carts");
    });

    it("declares the conventional proof path with a bare --proof", async () => {
      const id = await seedStone(project, ["--proof"]);
      const { stone } = await project.stone(id);
      expect(stone.proof).toBe(`.cairn/proofs/${id}.spec.ts`);
    });

    it("refuses acceptance criteria that leak implementation detail", async () => {
      const result = await cli(
        [
          "add",
          "--title",
          "Total",
          "--acceptance",
          "the #cart-total element shows the price",
          "--acceptance",
          "GET /api/cart returns the total",
          "--request",
          "montre le total",
        ],
        { cwd: project.root },
      );

      expect(result.code).toBe(2);
      expect(result.stderr).toContain("user language");
      expect(result.stderr).toContain("css-selector");
      expect(result.stderr).toContain("http-route");

      const list = await cli(["list", "--json"], { cwd: project.root });
      expect(list.json<{ count: number }>().count).toBe(0);
    });

    it("creates the stone anyway with --force, and says so", async () => {
      const result = await cli(
        [
          "add",
          "--title",
          "Total",
          "--acceptance",
          "the #cart-total element shows the price",
          "--request",
          "montre le total",
          "--force",
        ],
        { cwd: project.root },
      );

      expect(result.code).toBe(0);
      expect(result.stderr).toContain("forced");
      const list = await cli(["list", "--json"], { cwd: project.root });
      expect(list.json<{ count: number }>().count).toBe(1);
    });

    it("reads a full payload from stdin with --json", async () => {
      const payload = {
        title: "Checkout refuses an empty cart",
        intent: "Nobody should pay for nothing.",
        acceptance: ["the shopper cannot pay with an empty cart"],
        surface: "checkout",
        provenance: { request: "on ne doit pas pouvoir payer un panier vide", attempts: 2, tokens: 1200 },
      };

      const result = await cli(["add", "--json"], {
        cwd: project.root,
        stdin: JSON.stringify(payload),
      });

      expect(result.code).toBe(0);
      const created = result.json<{ ok: boolean; stone: Stone; path: string }>();
      expect(created.ok).toBe(true);
      expect(created.stone.title).toBe(payload.title);
      expect(created.stone.provenance).toEqual(payload.provenance);
      expect(created.path).toBe(`.cairn/stones/${created.stone.id}.md`);
    });

    it("answers in JSON from flags alone, without any payload on stdin", async () => {
      const result = await cli(
        [
          "add",
          "--json",
          "--title",
          "No stdin needed",
          "--acceptance",
          "the shopper sees the total",
          "--request",
          "je veux voir le total",
        ],
        { cwd: project.root, stdin: "" },
      );

      expect(result.code).toBe(0);
      expect(result.json<{ stone: Stone }>().stone.title).toBe("No stdin needed");
    });

    it("lets flags override the JSON payload", async () => {
      const result = await cli(["add", "--json", "--surface", "cli"], {
        cwd: project.root,
        stdin: JSON.stringify({
          title: "From the payload",
          surface: "checkout",
          acceptance: ["the shopper sees the total"],
          request: "je veux voir le total",
        }),
      });

      const stone = result.json<{ stone: Stone }>().stone;
      expect(stone.title).toBe("From the payload");
      expect(stone.surface).toBe("cli");
    });

    it("rejects a malformed JSON payload", async () => {
      const result = await cli(["add", "--json"], { cwd: project.root, stdin: "{not json" });
      expect(result.code).toBe(2);
      expect(result.stderr).toContain("not valid JSON");
    });

    it("reports lint violations as JSON when the payload came as JSON", async () => {
      const result = await cli(["add", "--json"], {
        cwd: project.root,
        stdin: JSON.stringify({
          title: "Bad",
          acceptance: ["renderCart() paints src/cart.ts"],
          request: "x",
        }),
      });

      expect(result.code).toBe(2);
      const payload = result.json<{ ok: boolean; violations: Array<{ rule: string }> }>();
      expect(payload.ok).toBe(false);
      expect(payload.violations.map((violation) => violation.rule)).toContain("function-call");
      expect(payload.violations.map((violation) => violation.rule)).toContain("file-path");
    });

    it("refuses a stone without a title or without provenance", async () => {
      const noTitle = await cli(["add", "--acceptance", "something happens", "--request", "x"], {
        cwd: project.root,
      });
      expect(noTitle.code).toBe(2);
      expect(noTitle.stderr).toContain("title");

      const noRequest = await cli(["add", "--title", "Something", "--acceptance", "it works"], {
        cwd: project.root,
      });
      expect(noRequest.code).toBe(2);
      expect(noRequest.stderr).toContain("provenance");
    });

    it("prompts a human when nothing was passed on the command line", async () => {
      const result = await cli(["add"], {
        cwd: project.root,
        isTTY: true,
        answers: [
          "Le panier se vide",
          "the intent",
          "the shopper can empty the cart",
          "",
          "je veux pouvoir vider mon panier",
        ],
      });

      expect(result.code).toBe(0);
      const list = await cli(["list", "--json"], { cwd: project.root });
      const stones = list.json<{ stones: Stone[] }>().stones;
      expect(stones[0]?.title).toBe("Le panier se vide");
      expect(stones[0]?.acceptance).toEqual(["the shopper can empty the cart"]);
      expect(stones[0]?.provenance.request).toBe("je veux pouvoir vider mon panier");
    });

    it("refuses to work without a cairn", async () => {
      const empty = await makeProject();
      try {
        const result = await cli(["add", "--title", "x", "--request", "y"], { cwd: empty.root });
        expect(result.code).toBe(1);
        expect(result.stderr).toContain("cairn init");
      } finally {
        await empty.cleanup();
      }
    });
  });

  describe("list", () => {
    it("filters by status and by surface, and hides retired stones", async () => {
      const first = await seedStone(project, ["--surface", "checkout"]);
      await seedStone(project, ["--surface", "cli"]);

      const all = await cli(["list", "--json"], { cwd: project.root });
      expect(all.json<{ count: number }>().count).toBe(2);

      const checkout = await cli(["list", "--surface", "checkout", "--json"], { cwd: project.root });
      const stones = checkout.json<{ stones: Stone[] }>().stones;
      expect(stones).toHaveLength(1);
      expect(stones[0]?.id).toBe(first);

      const drafts = await cli(["list", "--status", "draft", "--json"], { cwd: project.root });
      expect(drafts.json<{ count: number }>().count).toBe(2);

      const proven = await cli(["list", "--status", "proven", "--json"], { cwd: project.root });
      expect(proven.json<{ count: number }>().count).toBe(0);
    });

    it("rejects an unknown status", async () => {
      const result = await cli(["list", "--status", "molten"], { cwd: project.root });
      expect(result.code).toBe(2);
      expect(result.stderr).toContain("Unknown status");
    });

    it("prints a table a human can read", async () => {
      const id = await seedStone(project, ["--surface", "checkout"]);
      const result = await cli(["list"], { cwd: project.root });

      expect(result.stdout).toContain("STATUS");
      expect(result.stdout).toContain("draft");
      expect(result.stdout).toContain(id.slice(0, 8));
      expect(result.stdout).toContain("checkout");

      const long = await cli(["list", "--long"], { cwd: project.root });
      expect(long.stdout).toContain(id);
    });

    it("says so when the cairn is empty", async () => {
      const result = await cli(["list"], { cwd: project.root });
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("empty");
    });
  });

  describe("show", () => {
    it("prints one stone in full, and in JSON", async () => {
      const id = await seedStone(project, ["--surface", "checkout"]);

      const human = await cli(["show", id], { cwd: project.root });
      expect(human.code).toBe(0);
      expect(human.stdout).toContain(id);
      expect(human.stdout).toContain("acceptance");
      expect(human.stdout).toContain("je veux voir le total dans le panier");

      const json = await cli(["show", id.toLowerCase(), "--json"], { cwd: project.root });
      const payload = json.json<{ stone: Stone & { path: string }; lineage: unknown[] }>();
      expect(payload.stone.id).toBe(id);
      expect(payload.stone.path).toBe(`.cairn/stones/${id}.md`);
      expect(payload.lineage).toHaveLength(1);
    });

    it("fails cleanly on an unknown id", async () => {
      const result = await cli(["show", "01ARZ3NDEKTSV4RRFFQ69G5FAV"], { cwd: project.root });
      expect(result.code).toBe(2);
      expect(result.stderr).toContain("No stone with id");
    });
  });

  describe("amend", () => {
    it("creates a linked draft, retires the old stone and records lineage both ways", async () => {
      const oldId = await seedStone(project, ["--surface", "checkout", "--proof"]);
      await project.proof(oldId);

      const result = await cli(
        [
          "amend",
          oldId,
          "--title",
          "Le panier affiche le total et les frais de port",
          "--acceptance",
          "the shopper sees the shipping cost next to the total",
          "--request",
          "en fait je veux aussi les frais de port",
          "--json",
        ],
        { cwd: project.root, stdin: "{}" },
      );

      expect(result.code).toBe(0);
      const payload = result.json<{ stone: Stone; retired: Stone }>();

      expect(payload.stone.status).toBe("draft");
      expect(payload.stone.amends).toBe(oldId);
      expect(payload.stone.proof).toBeNull();
      expect(payload.retired.status).toBe("retired");
      expect(payload.retired.amendedBy).toBe(payload.stone.id);

      // Both stones on disk agree with the response.
      const { stone: newStone } = await project.stone(payload.stone.id);
      const { stone: oldStone } = await project.stone(oldId);
      expect(newStone.amends).toBe(oldId);
      expect(newStone.title).toBe("Le panier affiche le total et les frais de port");
      expect(newStone.acceptance).toEqual(["the shopper sees the shipping cost next to the total"]);
      expect(oldStone.status).toBe("retired");
      expect(oldStone.amendedBy).toBe(newStone.id);

      // The retired stone leaves the default listing.
      const list = await cli(["list", "--json"], { cwd: project.root });
      expect(list.json<{ count: number }>().count).toBe(1);
      const withRetired = await cli(["list", "--all", "--json"], { cwd: project.root });
      expect(withRetired.json<{ count: number }>().count).toBe(2);

      // And `show` walks the chain.
      const show = await cli(["show", payload.stone.id, "--json"], { cwd: project.root });
      expect(show.json<{ lineage: Array<{ id: string }> }>().lineage.map((entry) => entry.id)).toEqual([
        oldId,
        payload.stone.id,
      ]);
    });

    it("inherits title, surface, acceptance and provenance when nothing is passed", async () => {
      const oldId = await seedStone(project, ["--surface", "checkout"]);
      const result = await cli(["amend", oldId, "--json"], { cwd: project.root, stdin: "{}" });

      const payload = result.json<{ stone: Stone }>();
      const { stone: original } = await project.stone(oldId);
      expect(payload.stone.title).toBe(original.title);
      expect(payload.stone.surface).toBe("checkout");
      expect(payload.stone.acceptance).toEqual(original.acceptance);
      expect(payload.stone.provenance).toEqual(original.provenance);
    });

    it("carries the old proof over when asked", async () => {
      const oldId = await seedStone(project, ["--proof"]);
      await project.proof(oldId, "// the original proof\n");

      const result = await cli(["amend", oldId, "--carry-proof", "--json"], {
        cwd: project.root,
        stdin: "{}",
      });
      const newId = result.json<{ stone: Stone }>().stone.id;

      expect(result.code).toBe(0);
      await expect(project.read(".cairn", "proofs", `${newId}.spec.ts`)).resolves.toContain(
        "the original proof",
      );
    });

    it("refuses to amend a retired stone", async () => {
      const oldId = await seedStone(project);
      const first = await cli(["amend", oldId, "--json"], { cwd: project.root, stdin: "{}" });
      expect(first.code).toBe(0);

      const second = await cli(["amend", oldId], { cwd: project.root });
      expect(second.code).toBe(1);
      expect(second.stderr).toContain("already retired");
    });

    it("refuses acceptance criteria that leak implementation detail", async () => {
      const oldId = await seedStone(project);
      const result = await cli(["amend", oldId, "--acceptance", "the .cart-total is green"], {
        cwd: project.root,
      });

      expect(result.code).toBe(2);
      const { stone } = await project.stone(oldId);
      expect(stone.status).toBe("draft");
    });
  });

  describe("escalate", () => {
    it("moves a draft to escalated and refuses a proven stone", async () => {
      const id = await seedStone(project);
      const escalated = await cli(["escalate", id, "--attempts", "5", "--tokens", "42000"], {
        cwd: project.root,
      });

      expect(escalated.code).toBe(0);
      const { stone } = await project.stone(id);
      expect(stone.status).toBe("escalated");
      expect(stone.provenance.attempts).toBe(5);
      expect(stone.provenance.tokens).toBe(42000);

      const again = await cli(["escalate", id], { cwd: project.root });
      expect(again.code).toBe(1);
      expect(again.stderr).toContain("Cannot escalate a stone whose status is escalated");
    });
  });

  describe("status", () => {
    it("synthesises counts, drafts, broken and escalated stones", async () => {
      const draft = await seedStone(project);
      const toEscalate = await seedStone(project);
      await cli(["escalate", toEscalate], { cwd: project.root });

      const human = await cli(["status"], { cwd: project.root });
      expect(human.code).toBe(0);
      expect(human.stdout).toContain("awaiting a proof");
      expect(human.stdout).toContain("escalated");
      expect(human.stdout).toContain(draft.slice(0, 8));

      const json = await cli(["status", "--json"], { cwd: project.root });
      const payload = json.json<{
        total: number;
        active: number;
        counts: Record<string, number>;
        coverage: number;
        drafts: Array<{ id: string }>;
        escalated: Array<{ id: string }>;
        broken: unknown[];
      }>();

      expect(payload.total).toBe(2);
      expect(payload.active).toBe(2);
      expect(payload.counts.draft).toBe(1);
      expect(payload.counts.escalated).toBe(1);
      expect(payload.coverage).toBe(0);
      expect(payload.drafts.map((entry) => entry.id)).toEqual([draft]);
      expect(payload.escalated.map((entry) => entry.id)).toEqual([toEscalate]);
      expect(payload.broken).toEqual([]);
    });

    it("says the cairn is empty when it is", async () => {
      const result = await cli(["status"], { cwd: project.root });
      expect(result.stdout).toContain("empty");
    });
  });

  describe("the command surface itself", () => {
    it("prints help and a version without failing", async () => {
      const help = await cli(["--help"], { cwd: project.root });
      expect(help.code).toBe(0);
      expect(help.stdout).toContain("verify");
      expect(help.stdout).toContain("amend");

      const version = await cli(["--version"], { cwd: project.root });
      expect(version.code).toBe(0);
      expect(version.stdout).toContain("0.1.0");
    });

    it("refuses an unknown command with exit code 2", async () => {
      const result = await cli(["quarry"], { cwd: project.root });
      expect(result.code).toBe(2);
    });

    it("finds the cairn from a subdirectory", async () => {
      const id = await seedStone(project);
      const { mkdir } = await import("node:fs/promises");
      const nested = project.path("apps", "web", "src");
      await mkdir(nested, { recursive: true });

      const result = await cli(["list", "--json"], { cwd: nested });
      expect(result.json<{ stones: Array<{ id: string }> }>().stones[0]?.id).toBe(id);
    });
  });
});
