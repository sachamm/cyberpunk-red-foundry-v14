// Bundled DLC content (see src/dlc/README.md).
//
// The upstream Cyberpunk RED DLC module is bundled into this system under
// src/dlc/. Everything that wires it into the build lives in this file so the
// whole bundle can be removed by deleting src/dlc/ and tools/dlc/ and undoing
// the `withDlc(...)` and `bundleDlc` lines in gulpfile.mjs. src/system.json is
// never edited: the DLC packs and pack folders are merged into the manifest at
// build time from src/dlc/dlc.json.
//
// Set CPR_SKIP_DLC=1 to build the system without the bundled DLC.
import fs from "fs-extra";
import path from "node:path";

export const DLC_DIR = "dlc";

const enabled = () => !process.env.CPR_SKIP_DLC;

/**
 * Read the DLC manifest fragment (packs + packFolders) for a source dir.
 *
 * @param {string} srcDirPath - The system source directory (src/)
 * @returns {{packs: Object[], packFolders: Object[]}}
 */
export function readDlcManifest(srcDirPath) {
  const file = path.join(srcDirPath, DLC_DIR, "dlc.json");
  if (!enabled() || !fs.existsSync(file)) return { packs: [], packFolders: [] };
  const dlc = fs.readJSONSync(file);

  // v12-era content the module dropped (tools/dlc/import-legacy.mjs). Its
  // packs join the module's compendium folder of the same name.
  const legacyFile = path.join(srcDirPath, DLC_DIR, "legacy", "legacy.json");
  if (!fs.existsSync(legacyFile)) return dlc;
  const legacy = fs.readJSONSync(legacyFile);
  const packFolders = dlc.packFolders.map((f) => ({
    ...f,
    packs: [...f.packs],
  }));
  for (const folder of legacy.packFolders) {
    const match = packFolders.find((f) => f.name === folder.name);
    if (match) match.packs.push(...folder.packs);
    else packFolders.push(folder);
  }
  return { packFolders, packs: [...dlc.packs, ...legacy.packs] };
}

/**
 * Wrap a build Config class so its manifest also declares the DLC packs, the
 * DLC sources are kept out of the generic copy/image tasks, and the DLC
 * packs are kept out of the core Babele (re)generation.
 *
 * @param {typeof import("../../gulp/config.mjs").default} Base
 * @returns {typeof Base}
 */
export const withDlc = (Base) =>
  class extends Base {
    get dlcManifest() {
      this._dlcManifest ??= readDlcManifest(this.srcDirPath);
      return this._dlcManifest;
    }

    get manifest() {
      const manifest = super.manifest;
      const { packs, packFolders } = this.dlcManifest;
      if (packs.length === 0) return manifest;
      return {
        ...manifest,
        packs: [...manifest.packs, ...packs],
        packFolders: [...(manifest.packFolders ?? []), ...packFolders],
      };
    }

    get excludeDirs() {
      // Without the DLC nothing under src/dlc/ ships. With it, packs are
      // compiled and Babele files are relocated by bundleDlc, so neither is
      // copied verbatim.
      if (!enabled()) return [...super.excludeDirs, DLC_DIR];
      return [
        ...super.excludeDirs,
        path.join(DLC_DIR, "packs"),
        path.join(DLC_DIR, "babele"),
      ];
    }

    get packs() {
      const packs = super.packs;
      return {
        ...packs,
        excludePacks: [
          ...(packs.excludePacks ?? []),
          ...this.dlcManifest.packs.map((p) => p.name),
        ],
      };
    }
  };

/**
 * Gulp task: put the DLC Babele translations where the system's Babele
 * registration (`babele/<lang>/`) finds them and ship the DLC licence,
 * credits and readme next to the DLC content.
 *
 * @param {Object} config - Build configuration (wrapped with withDlc)
 * @returns {Function} Gulp task
 */
export const bundleDlc = (config) => async (done) => {
  const srcDlc = path.join(config.srcDirPath, DLC_DIR);
  if (!enabled() || !fs.existsSync(srcDlc)) return done();

  const babeleSrc = path.join(srcDlc, "babele");
  if (fs.existsSync(babeleSrc)) {
    for (const lang of fs.readdirSync(babeleSrc)) {
      fs.copySync(
        path.join(babeleSrc, lang),
        path.join(config.buildDirPath, config.babele.dir, lang),
      );
    }
  }
  for (const doc of ["LICENCE.md", "CREDITS.md", "README.md"]) {
    const file = path.join(srcDlc, doc);
    if (fs.existsSync(file)) {
      fs.copySync(file, path.join(config.buildDirPath, DLC_DIR, doc));
    }
  }
  return done();
};
