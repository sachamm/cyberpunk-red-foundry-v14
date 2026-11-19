/**
 * Add a source label (the pack's originating package) to the header banner
 * of an opened Compendium popout, mirroring how the Compendium sidebar shows
 * each pack's source on its thumbnail. Foundry does not identify a pack's
 * source once it is open, which makes core and module/DLC packs easy to
 * confuse (WI #1180).
 */
const CompendiumSourceLabel = () => {
  /**
   * @public
   * @memberof hookEvents
   */
  Hooks.on("renderCompendium", (app, element) => {
    const metadata = app.collection?.metadata;
    if (!metadata?.id) return;

    // The canonical pack id is "<package>.<pack>"; the source is everything
    // before the first dot.
    const [source] = metadata.id.split(".");
    if (!source) return;

    const banner = element.querySelector(".header-banner");
    if (!banner || banner.querySelector(".cpr-compendium-source")) return;

    const label = document.createElement("div");
    label.className = "cpr-compendium-source";

    // Same per-package-type icon the sidebar uses (fa-dice for systems,
    // fa-globe-asia for worlds, fa-plug for modules).
    const icon = document.createElement("i");
    const sourceIcon =
      foundry.packages.PACKAGE_TYPES[metadata.packageType]?.icon ?? "";
    icon.className = `fa-solid ${sourceIcon}`.trim();
    icon.setAttribute("inert", "");

    label.append(icon, source);
    banner.append(label);
  });
};

export default CompendiumSourceLabel;
