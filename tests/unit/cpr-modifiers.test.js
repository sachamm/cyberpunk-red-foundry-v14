import { describe, expect, it } from "vitest";

import CPRMod from "../../src/modules/rolls/cpr-modifiers.js";

describe("CPRMod", () => {
  it("preserves CPR category and situational flags", () => {
    const change = { key: "bonuses.accounting", type: "add", value: 2 };
    const effect = {
      id: "effect-id",
      name: "Accounting Boost",
      system: { changes: [change] },
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
    expect(mod.changeMode).toBe("add");
    expect(mod.value).toBe(2);
    expect(mod.isSituational).toBe(true);
    expect(mod.onByDefault).toBe(true);
  });

  it("treats changes without CPR flags as editable custom modifiers", () => {
    const change = { key: "system.custom.value", type: "add", value: 1 };
    const effect = {
      id: "effect-id",
      name: "Imported Effect",
      system: { changes: [change] },
      flags: {},
    };

    const mod = new CPRMod(effect, change);

    expect(mod.category).toBe("custom");
    expect(mod.isSituational).toBe(false);
    expect(mod.onByDefault).toBe(false);
  });
  it("excludes expired effects from rolls while keeping them editable", () => {
    const effect = {
      id: "expired",
      name: "Expired boost",
      active: false,
      disabled: false,
      system: {
        isSuppressed: false,
        changes: [{ key: "bonuses.accounting", type: "add", value: 2 }],
      },
      flags: {},
    };
    expect(CPRMod.getAllModifiers([effect])).toEqual([]);
    expect(CPRMod.getAllModifiers([effect], true)).toHaveLength(1);
  });
});
