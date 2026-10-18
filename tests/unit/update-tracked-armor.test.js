import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import updateTrackedArmor from "../../src/modules/hooks/actor/sheet/update-tracked-armor.js";

let onUpdate;

beforeEach(() => {
  vi.spyOn(Hooks, "on").mockImplementation((event, listener) => {
    if (event === "updateItem") onUpdate = listener;
  });
  updateTrackedArmor();
});

afterEach(() => vi.restoreAllMocks());

function armor() {
  return {
    id: "armor",
    _id: "armor",
    type: "armor",
    isEmbedded: true,
    actor: {
      system: {
        externalData: {
          currentArmorHead: { id: null },
          currentArmorBody: { id: null },
          currentArmorShield: { id: null },
        },
      },
      updateTrackedArmor: vi.fn(),
    },
  };
}

describe.each([
  ["head", "headLocation", "currentArmorHead"],
  ["body", "bodyLocation", "currentArmorBody"],
  ["shield", "shieldHitPoints", "currentArmorShield"],
])("tracked %s armor updates", (location, field, trackedField) => {
  it("refreshes the owning actor only when this item is tracked at that location", () => {
    const doc = armor();
    doc.actor.system.externalData[trackedField].id = doc.id;
    onUpdate(doc, { system: { [field]: { value: 3 } } });
    expect(doc.actor.updateTrackedArmor).toHaveBeenCalledExactlyOnceWith(
      location,
      doc.id,
    );
  });

  it("does not replace a different item tracked at the edited location", () => {
    const doc = armor();
    for (const entry of Object.values(doc.actor.system.externalData))
      entry.id = doc.id;
    doc.actor.system.externalData[trackedField].id = "other-armor";
    onUpdate(doc, { system: { [field]: { value: 3 } } });
    expect(doc.actor.updateTrackedArmor).not.toHaveBeenCalled();
  });

  it("ignores unrelated fields", () => {
    const doc = armor();
    doc.actor.system.externalData[trackedField].id = doc.id;
    onUpdate(doc, { system: { penalty: -2 } });
    expect(doc.actor.updateTrackedArmor).not.toHaveBeenCalled();
  });
});

it("ignores world items, non-armor, container owners and non-system updates", () => {
  const doc = armor();
  onUpdate(
    { ...doc, isEmbedded: false, actor: null },
    { system: { bodyLocation: {} } },
  );
  onUpdate(
    { ...doc, type: "clothing", actor: null },
    { system: { bodyLocation: {} } },
  );
  onUpdate({ ...doc, actor: { system: {} } }, { system: { bodyLocation: {} } });
  onUpdate(doc, { name: "Renamed armor" });
  expect(doc.actor.updateTrackedArmor).not.toHaveBeenCalled();
});
