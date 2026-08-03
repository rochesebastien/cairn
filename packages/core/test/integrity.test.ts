import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkIntegrity, hashProof, shortHash, withProofHash } from "../src/integrity.js";
import { applyVerifyResult } from "../src/transitions.js";
import { makeStone } from "./helpers.js";

const PROOF = [
  'import { test, expect } from "@playwright/test";',
  "",
  'test("le visiteur peut se connecter", async ({ page }) => {',
  '  await page.goto("/");',
  "});",
].join("\n");

describe("hashProof", () => {
  it("is a sha256 hex digest of the normalised content", () => {
    expect(hashProof(PROOF)).toBe(createHash("sha256").update(PROOF, "utf8").digest("hex"));
    expect(hashProof(PROOF)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable across CRLF and BOM (Windows checkouts)", () => {
    expect(hashProof(PROOF.replace(/\n/g, "\r\n"))).toBe(hashProof(PROOF));
    expect(hashProof(`\uFEFF${PROOF}`)).toBe(hashProof(PROOF));
  });

  it("changes when the proof changes, even by one character", () => {
    expect(hashProof(`${PROOF} `)).not.toBe(hashProof(PROOF));
    expect(hashProof("")).not.toBe(hashProof(PROOF));
  });

  it("shortens for display", () => {
    expect(shortHash(hashProof(PROOF))).toHaveLength(12);
    expect(shortHash(hashProof(PROOF), 7)).toBe(hashProof(PROOF).slice(0, 7));
  });
});

describe("checkIntegrity", () => {
  const proven = makeStone({
    status: "proven",
    proof: ".cairn/proofs/a.spec.ts",
    lastGreen: { at: "2026-08-03T12:00:00.000Z", proofHash: hashProof(PROOF) },
  });

  it("matches an unchanged proof", () => {
    const report = checkIntegrity(proven, PROOF);
    expect(report.status).toBe("match");
    expect(report.ok).toBe(true);
    expect(report.expected).toBe(report.actual);
  });

  it("matches a proof stored with CRLF", () => {
    expect(checkIntegrity(proven, PROOF.replace(/\n/g, "\r\n")).status).toBe("match");
  });

  it("detects a modified proof", () => {
    const report = checkIntegrity(proven, `${PROOF}\n// edited`);
    expect(report.status).toBe("mismatch");
    expect(report.ok).toBe(false);
    expect(report.expected).not.toBe(report.actual);
    expect(report.message).toContain(shortHash(hashProof(PROOF)));
  });

  it("reports unknown when the stone has never been green with a hash", () => {
    const draft = makeStone({ status: "draft", proof: ".cairn/proofs/a.spec.ts" });
    const report = checkIntegrity(draft, PROOF);
    expect(report.status).toBe("unknown");
    expect(report.ok).toBe(true);
    expect(report.actual).toBe(hashProof(PROOF));
    expect(report.expected).toBeUndefined();

    const noHash = makeStone({
      status: "proven",
      lastGreen: { at: "2026-08-03T12:00:00.000Z", commit: "abc" },
    });
    expect(checkIntegrity(noHash, PROOF).status).toBe("unknown");
  });

  it("reports missing when a declared proof is absent", () => {
    const report = checkIntegrity(proven, undefined);
    expect(report.status).toBe("missing");
    expect(report.ok).toBe(false);
    expect(report.message).toContain(".cairn/proofs/a.spec.ts");
    expect(checkIntegrity(proven, null).status).toBe("missing");
  });

  it("is ok for a stone that declares no proof at all", () => {
    const report = checkIntegrity(makeStone({ status: "draft" }), undefined);
    expect(report.status).toBe("unknown");
    expect(report.ok).toBe(true);
  });
});

describe("withProofHash", () => {
  it("stamps the hash onto an existing lastGreen", () => {
    const stone = applyVerifyResult(makeStone({ status: "draft" }), "green", {
      at: "2026-08-03T12:00:00.000Z",
    }).stone;

    const stamped = withProofHash(stone, PROOF);
    expect(stamped.lastGreen).toEqual({
      at: "2026-08-03T12:00:00.000Z",
      proofHash: hashProof(PROOF),
    });
    expect(checkIntegrity(stamped, PROOF).status).toBe("match");
  });

  it("leaves a stone without lastGreen untouched", () => {
    const stone = makeStone();
    expect(withProofHash(stone, PROOF)).toBe(stone);
  });

  it("closes the verify loop: green → stamp → integrity match → edit → mismatch", () => {
    const green = applyVerifyResult(makeStone({ status: "draft" }), "green", {
      proofHash: hashProof(PROOF),
    }).stone;

    expect(checkIntegrity(green, PROOF).ok).toBe(true);
    expect(checkIntegrity(green, `${PROOF}\n// tampered`).ok).toBe(false);
  });
});
