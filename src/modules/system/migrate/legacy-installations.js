/** Convert legacy installation references without resolving live Documents.
 * This also runs during model construction, before the migration wizard exists.
 * Unknown references are retained so the numbered migration can report them.
 */
export function installationId(reference) {
  if (typeof reference !== "string") return reference;
  if (/^[a-zA-Z0-9]{16}$/.test(reference)) return reference;
  const item = reference.match(/(?:^|\.)Item\.([a-zA-Z0-9]{16})$/);
  if (item) return item[1];
  const pack = reference.match(/^Compendium\.[^.]+\.[^.]+\.([a-zA-Z0-9]{16})$/);
  return pack?.[1] ?? reference;
}

export function normalizeLegacyInstallations(source) {
  const installed = source?.installedItems;
  if (!installed) return;
  if (Array.isArray(installed.list)) {
    installed.list = [...new Set(installed.list.map(installationId))];
  }
  if (Array.isArray(installed.allowedTypes)) {
    installed.allowedTypes = [
      ...new Set(
        installed.allowedTypes
          .flat(Infinity)
          .map((t) => (t === "programs" ? "program" : t)),
      ),
    ];
  }
}

/** Serialized items in either generation of the installation-tree flag. */
export function installedTreeItems(item) {
  const trees = [
    item.flags?.cprInstallTree,
    item.flags?.["cyberpunk-red-core"]?.cprInstallTree,
  ];
  return trees.filter(Array.isArray).flat();
}

/** Apply deletion directives before stamping serialized equipment, so the
 * resulting source also works outside Foundry's update pipeline.
 */
export function applySerializedDeletions(value) {
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (key.startsWith("-=")) {
      delete value[key.slice(2)];
      delete value[key];
    } else {
      applySerializedDeletions(value[key]);
    }
  }
}
