import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClothingUpgradeEffects from "../../src/modules/system/migrate/scripts/049-clothing-upgrade-effects.js";
import Effects from "../../src/modules/item/mixins/cpr-effects.js";
import SystemUtils from "../../src/modules/utils/cpr-systemUtils.js";

const systemId = "cyberpunk-red-core";
const upgrade = (modifiers = {}) => ({
  type: "itemUpgrade",
  name: "Tailored lining",
  system: { type: "clothing", usage: "toggled", modifiers },
  effects: [],
});
const modifier = (value, extra = {}) => ({ type: "modifier", value, ...extra });

beforeEach(() => {
  vi.spyOn(SystemUtils, "getDocTypesFromMixin").mockReturnValue([
    "clothing",
    "gear",
  ]);
  vi.stubGlobal("CONST", { ACTIVE_EFFECT_MODES: { ADD: 2 } });
  vi.stubGlobal("foundry", {
    utils: { ...foundry.utils, randomID: () => "ClothingEffect01" },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("clothing upgrade migration", () => {
  it("converts bonuses without replacing existing effects or their usage", async () => {
    const legacy = {
      cool: modifier(2, { isSituational: true, onByDefault: false }),
      "Wardrobe & Style": modifier(-3, {
        isSituational: true,
        onByDefault: true,
      }),
    };
    const data = upgrade(structuredClone(legacy));
    const existing = { _id: "OriginalEffect01", name: "Existing effect" };
    data.effects.push(existing);
    await new ClothingUpgradeEffects().updateItem(data);

    expect(data.effects[0]).toEqual(existing);
    expect(data.effects[1].changes).toEqual([
      { key: "system.stats.cool.value", mode: 2, value: "2" },
      { key: "bonuses.wardrobeAndStyle", mode: 2, value: "-3" },
    ]);
    expect(data.effects[1]).toMatchObject({ transfer: true, disabled: false });
    expect(data.effects[1].flags[systemId].changes).toEqual({
      cats: { 0: "stat", 1: "skill" },
      situational: {
        0: { isSituational: false, onByDefault: false },
        1: { isSituational: true, onByDefault: true },
      },
    });
    expect(data.flags[systemId].legacyClothingModifiers).toEqual(legacy);
    expect(data.system.usage).toBe("toggled");
    expect(data.system.modifiers).toEqual({
      "-=cool": null,
      "-=Wardrobe & Style": null,
    });
    await new ClothingUpgradeEffects().updateItem(data);
    expect(data.effects).toHaveLength(2);
    data.effects[1].changes[0].value = "5";
    data.system.modifiers = structuredClone(legacy);
    await new ClothingUpgradeEffects().updateItem(data);
    expect(data.effects).toHaveLength(2);
    expect(data.effects[1].changes[0].value).toBe("5");
  });

  it.each([0, null, -2])("preserves a saved value of %s", async (value) => {
    const data = upgrade({ cool: modifier(value) });
    await new ClothingUpgradeEffects().updateItem(data);
    expect(data.flags[systemId].legacyClothingModifiers.cool.value).toBe(value);
    expect(data.effects).toHaveLength(value ? 1 : 0);
    if (value) expect(data.effects[0].changes[0].value).toBe(String(value));
  });

  it("leaves other upgrades and unconfigured clothing alone", async () => {
    for (const data of [
      { ...upgrade({ cool: modifier(2) }), system: { type: "weapon" } },
      upgrade(),
      upgrade({ cool: undefined, "Wardrobe & Style": undefined }),
    ]) {
      const before = structuredClone(data);
      await new ClothingUpgradeEffects().updateItem(data);
      expect(data).toEqual(before);
    }
  });

  it("converts serialized installed upgrades, including nested trees", async () => {
    const child = upgrade({ "Wardrobe & Style": modifier(3) });
    const parent = {
      type: "clothing",
      flags: { [systemId]: { cprInstallTree: [null, child] } },
    };
    const root = {
      type: "gear",
      flags: { [systemId]: { cprInstallTree: [parent] } },
    };
    await new ClothingUpgradeEffects().updateItem(root);
    expect(child.effects[0].changes[0].key).toBe("bonuses.wardrobeAndStyle");
    expect(child.system.modifiers).toEqual({});
    await new ClothingUpgradeEffects().updateItem(root);
    expect(child.effects).toHaveLength(1);
  });
});

describe("clothing upgrade effect suppression", () => {
  it.each(["always", "toggled", "equipped", "installed"])(
    "requires an equipped clothing host with usage %s",
    (usage) => {
      const host = {
        type: "clothing",
        system: { equipped: "owned", installedItems: { list: ["upgrade"] } },
      };
      const item = {
        id: "upgrade",
        type: "itemUpgrade",
        system: { type: "clothing", usage },
        actor: { items: [host] },
      };
      Effects.call(item);
      expect(item.areEffectsSuppressed()).toBe(true);
      host.system.equipped = "carried";
      expect(item.areEffectsSuppressed()).toBe(true);
      host.system.equipped = "equipped";
      expect(item.areEffectsSuppressed()).toBe(false);
      host.system.installedItems.list = [];
      expect(item.areEffectsSuppressed()).toBe(true);
      host.system.installedItems.list = ["upgrade"];
      host.type = "armor";
      expect(item.areEffectsSuppressed()).toBe(true);
      item.actor = null;
      expect(item.areEffectsSuppressed()).toBe(true);
    },
  );

  it("does not change other items' effect usage", () => {
    const item = {
      type: "gear",
      system: { usage: "equipped", equipped: "owned" },
    };
    Effects.call(item);
    expect(item.areEffectsSuppressed()).toBe(true);
    item.system.equipped = "equipped";
    expect(item.areEffectsSuppressed()).toBe(false);
    item.system.usage = "always";
    item.system.equipped = "owned";
    expect(item.areEffectsSuppressed()).toBe(false);
  });
});
