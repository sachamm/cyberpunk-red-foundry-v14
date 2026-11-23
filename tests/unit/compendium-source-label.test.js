import { describe, expect, it } from "vitest";

import { resolveCompendiumSourceLabel } from "../../src/modules/hooks/foundry/ui/compendium-source-label.js";

/**
 * Tier-1 unit tests for the pure compendium source label resolver.
 *
 * The chip prefers the name of the Compendium Folder a pack is displayed in
 * (Foundry creates these folders from each package manifest's `packFolders`,
 * e.g. "Cyberpunk RED: Black Chrome"), and falls back to the raw source id —
 * the part of the pack id before the first dot — for packs with no folder.
 */

const pack = (id) => ({ id });

describe("resolveCompendiumSourceLabel", () => {
  it("shows the folder name for a system pack displayed in a folder", () => {
    expect(
      resolveCompendiumSourceLabel(
        pack("cyberpunk-red-core.core_weapons"),
        "Cyberpunk RED: Core",
      ),
    ).toBe("Cyberpunk RED: Core");
  });

  it("shows the folder name for a module pack displayed in a folder", () => {
    expect(
      resolveCompendiumSourceLabel(
        pack("cyberpunk-red-dlc.black-chrome_weapons"),
        "Cyberpunk RED: Black Chrome",
      ),
    ).toBe("Cyberpunk RED: Black Chrome");
  });

  it("shows the folder name for a world pack the GM moved into a folder", () => {
    expect(
      resolveCompendiumSourceLabel(pack("world.my_world_pack"), "My Folders"),
    ).toBe("My Folders");
  });

  it("falls back to the source id for a module pack with no folder", () => {
    expect(
      resolveCompendiumSourceLabel(pack("cyberpunk-red-dlc.dlc_weapons")),
    ).toBe("cyberpunk-red-dlc");
  });

  it("falls back to the source id for a system pack with no folder", () => {
    expect(
      resolveCompendiumSourceLabel(
        pack("cyberpunk-red-core.core_weapons"),
        null,
      ),
    ).toBe("cyberpunk-red-core");
  });

  it("falls back to world for a world pack with no folder", () => {
    expect(resolveCompendiumSourceLabel(pack("world.my_world_pack"))).toBe(
      "world",
    );
  });

  it("falls back to the source id when the folder name is empty", () => {
    expect(
      resolveCompendiumSourceLabel(pack("cyberpunk-red-dlc.dlc_weapons"), ""),
    ).toBe("cyberpunk-red-dlc");
  });

  it("returns null for a pack without an id", () => {
    expect(resolveCompendiumSourceLabel({})).toBeNull();
    expect(resolveCompendiumSourceLabel(undefined, "Some Folder")).toBeNull();
  });
});
