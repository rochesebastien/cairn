import { stoneSchema, type Stone, type StoneInput } from "../src/schema.js";

/** Deterministic, valid ULIDs (26 chars, Crockford base32, sortable). */
export const ID_A = `01J${"0".repeat(22)}A`;
export const ID_B = `01J${"0".repeat(22)}B`;
export const ID_C = `01J${"0".repeat(22)}C`;

/** A valid stone with sensible defaults; override anything. */
export function makeStone(patch: Partial<StoneInput> = {}): Stone {
  const base: StoneInput = {
    id: ID_A,
    title: "Le visiteur peut se connecter",
    status: "draft",
    createdAt: "2026-08-03T10:00:00.000Z",
    acceptance: ["Le visiteur arrive sur son tableau de bord après connexion"],
    provenance: { request: "je veux pouvoir me connecter" },
  };
  return stoneSchema.parse({ ...base, ...patch });
}
