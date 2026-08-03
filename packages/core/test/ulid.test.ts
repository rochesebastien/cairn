import { describe, expect, it } from "vitest";
import { assertUlid, isUlid, newUlid, normalizeUlid, ulidTime } from "../src/ulid.js";

describe("ulid", () => {
  it("generates 26-char canonical ULIDs", () => {
    const id = newUlid();
    expect(id).toHaveLength(26);
    expect(isUlid(id)).toBe(true);
  });

  it("generates monotonically sortable ids across time", () => {
    const early = newUlid(1_000_000_000_000);
    const late = newUlid(2_000_000_000_000);
    expect(early < late).toBe(true);
  });

  it("rejects malformed ids", () => {
    for (const bad of [
      "",
      "abc",
      "01J0000000000000000000000",       // 25 chars
      "01J00000000000000000000000A",     // 27 chars
      "81J0000000000000000000000A",      // first char > 7
      "01I0000000000000000000000A",      // I is not in the alphabet
      "01j0000000000000000000000a",      // lowercase is not canonical
      null,
      42,
    ]) {
      expect(isUlid(bad)).toBe(false);
    }
  });

  it("normalizes user input", () => {
    const id = newUlid();
    expect(normalizeUlid(`  ${id.toLowerCase()} `)).toBe(id);
  });

  it("decodes the embedded timestamp", () => {
    const at = 1_700_000_000_000;
    expect(ulidTime(newUlid(at))).toBe(at);
  });

  it("assertUlid throws on garbage", () => {
    expect(() => assertUlid("nope", "amends")).toThrow(/amends/);
    expect(() => assertUlid(newUlid())).not.toThrow();
  });
});
