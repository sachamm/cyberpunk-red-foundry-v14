import { describe, it, expect } from "vitest";

import Valuable from "../../src/modules/item/mixins/cpr-valuable.js";

/**
 * Tier-1 unit test for the pure price helpers in `cpr-valuable.js`. The module
 * only depends on the static config map, so the mixin is bound to a fake item
 * and exercised directly against its documented contract:
 *
 *   - calcPrice returns the category's canonical price, divided by 10 for ammo
 *     that sells in boxes (every variety except grenades and rockets);
 *   - getPriceCategory buckets a price into the highest tier it reaches, with
 *     any positive price landing at least in "dirtCheap".
 */

function bindFakeItem(type, system = {}) {
  const fakeItem = { type, system };
  Valuable.call(fakeItem);
  return fakeItem;
}

describe("calcPrice", () => {
  it("returns the category price for non-ammo items", () => {
    expect(bindFakeItem("weapon").calcPrice("premium")).toBe(100);
  });

  it("divides the price by ten for box-sold ammo varieties", () => {
    expect(
      bindFakeItem("ammo", { variety: "bullet" }).calcPrice("premium"),
    ).toBe(10);
  });

  it("keeps the full price for grenades and rockets, which sell singly", () => {
    expect(
      bindFakeItem("ammo", { variety: "grenade" }).calcPrice("premium"),
    ).toBe(100);
    expect(
      bindFakeItem("ammo", { variety: "rocket" }).calcPrice("premium"),
    ).toBe(100);
  });
});

describe("getPriceCategory", () => {
  it("maps zero to free", () => {
    expect(bindFakeItem("weapon").getPriceCategory(0)).toBe("free");
  });

  it("buckets a price into the highest tier it reaches", () => {
    const item = bindFakeItem("weapon");
    expect(item.getPriceCategory(3)).toBe("dirtCheap");
    expect(item.getPriceCategory(5)).toBe("dirtCheap");
    expect(item.getPriceCategory(6)).toBe("dirtCheap");
    expect(item.getPriceCategory(10)).toBe("cheap");
  });

  it("caps at superLuxury for the top tier", () => {
    const item = bindFakeItem("weapon");
    expect(item.getPriceCategory(9999)).toBe("luxury");
    expect(item.getPriceCategory(10000)).toBe("superLuxury");
  });
});
