import BaseMigrationScript from "../base-migration-script.js";

export default class ClothingUpgradeEffects extends BaseMigrationScript {
  static version = 49;

  static name = "Convert clothing upgrade bonuses to Active Effects";

  static documentFilters = {
    Item: { types: ["itemUpgrade"], mixins: ["container"] },
    Actor: { types: ["character", "mook", "container"], mixins: [] },
  };

  async updateItem(itemData) {
    this.#convertItem(itemData);
  }

  #convertItem(itemData, serialized = false) {
    if (!itemData || typeof itemData !== "object") return;
    const systemId = game.system.id;
    const tree = itemData.flags?.[systemId]?.cprInstallTree;
    if (Array.isArray(tree)) {
      for (const child of tree) this.#convertItem(child, true);
    }
    if (
      itemData.type !== "itemUpgrade" ||
      itemData.system?.type !== "clothing"
    ) {
      return;
    }

    const modifiers = itemData.system.modifiers ?? {};
    const legacy = Object.fromEntries(
      ["cool", "Wardrobe & Style"]
        .filter((key) => modifiers[key] !== undefined)
        .map((key) => [key, foundry.utils.duplicate(modifiers[key])]),
    );
    if (!Object.keys(legacy).length) return;

    itemData.flags ??= {};
    itemData.flags[systemId] ??= {};
    const flags = itemData.flags[systemId];
    if (!flags.legacyClothingModifiers) {
      // Keep original settings, including unsupported situational STAT flags,
      // as reference data only. The editable Active Effects now own the bonuses.
      flags.legacyClothingModifiers = legacy;
      const changes = [];
      const cats = {};
      const situational = {};
      for (const [key, modifier] of Object.entries(legacy)) {
        if (!Number.isFinite(modifier?.value) || modifier.value === 0) continue;
        const index = changes.length;
        const isStat = key === "cool";
        changes.push({
          key: isStat ? "system.stats.cool.value" : "bonuses.wardrobeAndStyle",
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: String(modifier.value),
        });
        cats[index] = isStat ? "stat" : "skill";
        situational[index] = {
          isSituational: !isStat && Boolean(modifier.isSituational),
          onByDefault: !isStat && Boolean(modifier.onByDefault),
        };
      }
      if (changes.length) {
        itemData.effects ??= [];
        itemData.effects.push({
          _id: foundry.utils.randomID(),
          name: itemData.name,
          img: itemData.img,
          transfer: true,
          disabled: false,
          changes,
          flags: { [systemId]: { changes: { cats, situational } } },
        });
      }
    }
    for (const key of Object.keys(legacy)) {
      delete modifiers[key];
      if (!serialized) modifiers[`-=${key}`] = null;
    }
  }
}
