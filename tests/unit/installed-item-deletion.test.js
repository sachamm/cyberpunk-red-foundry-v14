import { describe, expect, it, vi } from "vitest";

import { planInstalledItemDeletion } from "../../src/modules/item/installed-item-deletion.js";

function item(id, installedItems = []) {
  return {
    id,
    system: {
      installedItems: { list: installedItems },
    },
  };
}

function actorWith(items) {
  return {
    items,
    getOwnedItem: vi.fn((id) => items.find((entry) => entry.id === id)),
  };
}

describe("planInstalledItemDeletion", () => {
  it("preserves a child still referenced by a parent outside the deletion", () => {
    const actor = actorWith([
      item("weapon-a", ["ammo"]),
      item("weapon-b", ["ammo"]),
      item("ammo"),
    ]);

    expect(planInstalledItemDeletion(actor, ["weapon-a", "ammo"])).toEqual([
      "weapon-a",
    ]);
  });

  it("deletes a child when all of its referencing parents are deleted", () => {
    const actor = actorWith([item("weapon", ["ammo"]), item("ammo")]);

    expect(planInstalledItemDeletion(actor, ["weapon", "ammo"])).toEqual([
      "weapon",
      "ammo",
    ]);
  });

  it("does not block an explicit deletion of the installed item itself", () => {
    const actor = actorWith([item("weapon", ["ammo"]), item("ammo")]);

    expect(planInstalledItemDeletion(actor, ["ammo"])).toEqual(["ammo"]);
  });
});
