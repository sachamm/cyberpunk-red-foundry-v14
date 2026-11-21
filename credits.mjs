import path from "node:path";
import fs from "fs-extra";
import { MarkdownUtils } from "./utils/MarkdownUtils.mjs";
import { PackUtils } from "./utils/PackUtils.mjs";
import log from "./utils/logger.mjs";

/**
 * Resolves the source fragment directory for the configured credits pack by
 * matching its name in the manifest's `packs` array, mirroring how PackUtils
 * resolves fragment directories (`srcDir/<pack.path>`).
 *
 * @private
 * @param {Object} config - Build configuration object
 * @returns {string} Absolute path to the credits pack's fragment directory
 * @throws {Error} If the configured credits pack is not in the manifest
 */
function _resolveCreditsDir(config) {
  const { packName } = config.credits;
  const pack = config.manifest.packs?.find((p) => p.name === packName);
  if (!pack) {
    throw new Error(
      `Credits pack '${packName}' not found in manifest packs. Set credits.packName to an existing pack.`,
    );
  }
  return PackUtils.fragmentDir(config, pack);
}

/**
 * Generates Foundry journal pack fragments from the project's CREDITS file
 * (one page per top-level/section heading) into the configured credits pack's
 * source directory, ready for `compilePacks`. Disabled by default; enable via
 * the `credits` config option.
 *
 * @param {Object} config - Build configuration object
 * @param {Object} config.credits - Credits options
 * @param {boolean} config.credits.enabled - Whether to build credits packs
 * @param {string} config.credits.packName - Manifest pack name to write into
 * @returns {Function} Gulp task function that accepts a done callback
 */
export const buildCredits = (config) => async (done) => {
  if (!config.credits.enabled) {
    log.debug("Credits generation disabled, skipping buildCredits.");
    done();
    return;
  }

  try {
    log.debug("Generating credits...");
    const creditsDir = _resolveCreditsDir(config);
    const creditsFile = config.creditsPath;

    if (!fs.existsSync(creditsFile)) {
      throw new Error(
        `Credits file '${path.basename(creditsFile)}' not found at ${creditsFile}.`,
      );
    }

    // Clear and recreate so stale files don't linger.
    fs.emptyDirSync(creditsDir);

    const markdown = fs.readFileSync(creditsFile, "utf-8");
    await MarkdownUtils.generateCreditsJournal(config, markdown, creditsDir);

    log.debug("Finished generating credits.");
    done();
  } catch (error) {
    log.error(`Error generating credits: ${error.message}`);
    done(error);
  }
};
