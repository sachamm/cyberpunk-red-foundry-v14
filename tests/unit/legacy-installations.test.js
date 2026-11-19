import { describe, expect, it } from "vitest";
import {
  applySerializedDeletions,
  installedTreeItems,
  installationId,
  normalizeLegacyInstallations,
} from "../../src/modules/system/migrate/legacy-installations.js";

describe("legacy installation references", () => {
  it("applies deletion operators inside serialized equipment", () => {
    const item = {
      system: {
        source: { book: "Core" },
        "-=source": null,
        sources: [{ book: "Core", page: 1 }],
      },
      flags: { cprInstallTree: [], "-=cprInstallTree": null },
    };
    applySerializedDeletions(item);
    expect(item).toEqual({
      system: { sources: [{ book: "Core", page: 1 }] },
      flags: {},
    });
  });
  it("ignores non-array legacy flag namespaces", () => {
    expect(installedTreeItems({ flags: { cprInstallTree: {} } })).toEqual([]);
  });
  const id = "54LMb9e5hHf9xDxV";

  it.each([
    id,
    `Item.${id}`,
    `Actor.2NBHvzoDZimDhJdQ.Item.${id}`,
    `Scene.2NBHvzoDZimDhJdQ.Token.2NBHvzoDZimDhJdQ.Actor.2NBHvzoDZimDhJdQ.Item.${id}`,
    `Compendium.cyberpunk-red-core.core_weapons.Item.${id}`,
    `Compendium.cyberpunk-red-core.core_weapons.${id}`,
  ])("converts %s without resolving a live document", (reference) => {
    expect(installationId(reference)).toBe(id);
  });

  it("retains unsupported references for an explicit migration error", () => {
    expect(installationId("Actor.2NBHvzoDZimDhJdQ")).toBe(
      "Actor.2NBHvzoDZimDhJdQ",
    );
    expect(installationId(null)).toBeNull();
  });

  it("preserves equipment and allowed types across repeated normalization", () => {
    const source = {
      installedItems: {
        list: [`Actor.2NBHvzoDZimDhJdQ.Item.${id}`, id],
        allowedTypes: ["programs", ["cyberware", "itemUpgrade"]],
      },
      magazine: { value: 7, ammoData: { uuid: `Item.${id}` } },
    };
    normalizeLegacyInstallations(source);
    const once = structuredClone(source);
    normalizeLegacyInstallations(source);
    expect(source).toEqual(once);
    expect(source.installedItems).toEqual({
      list: [id],
      allowedTypes: ["program", "cyberware", "itemUpgrade"],
    });
    expect(source.magazine).toEqual({
      value: 7,
      ammoData: { uuid: `Item.${id}` },
    });
  });
});
