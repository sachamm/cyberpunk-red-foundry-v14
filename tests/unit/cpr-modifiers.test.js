import { describe, expect, it } from "vitest";

import CPRMod from "../../src/modules/rolls/cpr-modifiers.js";

describe("CPRMod", () => {
  it("preserves CPR category and situational flags", () => {
    const change = { key: "bonuses.accounting", mode: 2, value: "2" };
    const effect = {
      id: "effect-id",
      name: "Accounting Boost",
      changes: [change],
      flags: {
        "cyberpunk-red-core": {
          changes: {
            cats: { 0: "skill" },
            situational: {
              0: { isSituational: true, onByDefault: true },
            },
          },
        },
      },
    };

    const mod = new CPRMod(effect, change);

    expect(mod.category).toBe("skill");
    expect(mod.isSituational).toBe(true);
    expect(mod.onByDefault).toBe(true);
  });

  it("treats changes without CPR flags as editable custom modifiers", () => {
    const change = { key: "system.custom.value", mode: 2, value: "1" };
    const effect = {
      id: "effect-id",
      name: "Imported Effect",
      changes: [change],
      flags: {},
    };

    const mod = new CPRMod(effect, change);

    expect(mod.category).toBe("custom");
    expect(mod.isSituational).toBe(false);
    expect(mod.onByDefault).toBe(false);
  });
});
