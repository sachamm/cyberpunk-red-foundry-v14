/**
 * Add a source label to the header banner of an opened Compendium popout so
 * core and module/DLC packs stay distinguishable once open (WI #1180). The
 * label is the name of the Compendium Folder Foundry displays the pack in —
 * these folders are created from each package manifest's `packFolders`
 * section (e.g. "Cyberpunk RED: Black Chrome") — with a fallback to the raw
 * source id for packs without a folder. Folders are GM-mutable world data, so
 * the label tracks where the pack currently sits in the sidebar; that
 * trade-off was accepted over per-pack flags or translation strings (see MR
 * !1734 discussion).
 */

/**
 * Resolve the text shown on an opened Compendium's source chip. Prefers the
 * name of the Compendium Folder the pack is displayed in; falls back to the
 * raw source id — the part of the pack id before the first dot — for packs
 * without a folder (world packs, third-party modules without `packFolders`).
 * @param {{id?: string}} metadata  The compendium pack's metadata
 * @param {string|null} [folderName]  Name of the folder the pack is displayed in, if any
 * @returns {string|null}  The chip label, or null when the pack has no id
 */
export function resolveCompendiumSourceLabel(metadata, folderName = null) {
  const [source] = (metadata?.id ?? "").split(".");
  if (!source) return null;
  return folderName || source;
}

const CompendiumSourceLabel = () => {
  /**
   * @public
   * @memberof hookEvents
   */
  Hooks.on("renderCompendium", (app, element) => {
    const metadata = app.collection?.metadata;
    if (!metadata?.id) return;

    const label = resolveCompendiumSourceLabel(
      metadata,
      app.collection.folder?.name,
    );
    if (!label) return;

    const banner = element.querySelector(".header-banner");
    if (!banner || banner.querySelector(".cpr-compendium-source")) return;

    const chip = document.createElement("div");
    chip.className = "cpr-compendium-source";

    // Same per-package-type icon the sidebar uses (fa-dice for systems,
    // fa-globe-asia for worlds, fa-plug for modules).
    const icon = document.createElement("i");
    const sourceIcon =
      foundry.packages.PACKAGE_TYPES[metadata.packageType]?.icon ?? "";
    icon.className = `fa-solid ${sourceIcon}`.trim();
    icon.setAttribute("inert", "");

    chip.append(icon, label);
    banner.append(chip);
  });
};

export default CompendiumSourceLabel;
