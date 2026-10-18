import { describe, it, expect } from "vitest";

import { applyUpgradeValue } from "../../src/modules/item/mixins/cpr-upgradable.js";

/**
 * Tier-1 unit test for the pure `applyUpgradeValue` helper in
 * `cpr-upgradable.js`. The module has no Foundry dependencies, so the function
 * is exercised directly against its documented contract:
 *
 *   - a numeric override replaces the base value outright;
 *   - a numeric modifier is summed onto a numeric base;
 *   - a modifier applied to a non-numeric base (e.g. dice damage), or a
 *     non-numeric modifier, produces a "base + mod" string;
 *   - an empty or zero upgrade value leaves the coerced base unchanged.
 */

describe("applyUpgradeValue", () => {
  it("sums a numeric modifier onto a numeric base", () => {
    expect(applyUpgradeValue(6, { type: "modifier", value: 2 })).toBe(8);
  });

  it("replaces the base with an override value", () => {
    expect(applyUpgradeValue(6, { type: "override", value: 9 })).toBe(9);
  });

  it("appends a numeric modifier to a dice-string base", () => {
    expect(applyUpgradeValue("1d6", { type: "modifier", value: 2 })).toBe(
      "1d6 + 2",
    );
  });

  it("replaces a dice-string base with a string override", () => {
    expect(applyUpgradeValue("1d6", { type: "override", value: "2d6" })).toBe(
      "2d6",
    );
  });

  it("leaves the base unchanged for a zero modifier", () => {
    expect(applyUpgradeValue(6, { type: "modifier", value: 0 })).toBe(6);
  });

  it("leaves the base unchanged for an empty upgrade value", () => {
    expect(applyUpgradeValue(6, { type: "modifier", value: "" })).toBe(6);
  });

  it("keeps a non-numeric base as a string when a modifier applies", () => {
    expect(applyUpgradeValue("abc", { type: "modifier", value: 3 })).toBe(
      "abc + 3",
    );
  });

  it("stringifies the sum when the modifier is not a number", () => {
    expect(applyUpgradeValue(6, { type: "modifier", value: "3" })).toBe(
      "6 + 3",
    );
  });
});
