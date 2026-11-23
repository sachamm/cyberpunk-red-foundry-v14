import path from "node:path";
import fs from "fs-extra";
import { MarkdownUtils } from "./utils/MarkdownUtils.mjs";
import { PackUtils } from "./utils/PackUtils.mjs";
import log from "./utils/logger.mjs";

/**
 * Resolves the list of languages to generate changelog journals for. Reads
 * the manifest's `languages` array (each `{ lang, name }`), falling back to
 * English-only when the manifest declares none.
 *
 * @private
 * @param {Object} config - Build configuration object
 * @returns {Array<{lang: string, name: string}>} Languages to process
 */
function _resolveLanguages(config) {
  const languages = config.manifest.languages;
  if (Array.isArray(languages) && languages.length > 0) {
    return languages;
  }
  return [{ lang: "en", name: "English" }];
}

/**
 * Resolves the source fragment directory for the configured changelog pack by
 * matching its name in the manifest's `packs` array, mirroring how PackUtils
 * resolves fragment directories (`srcDir/<pack.path>`).
 *
 * @private
 * @param {Object} config - Build configuration object
 * @returns {string} Absolute path to the changelog pack's fragment directory
 * @throws {Error} If the configured changelog pack is not in the manifest
 */
function _resolveChangelogDir(config) {
  const { packName } = config.changelog;
  const pack = config.manifest.packs?.find((p) => p.name === packName);
  if (!pack) {
    throw new Error(
      `Changelog pack '${packName}' not found in manifest packs. Set changelog.packName to an existing pack.`,
    );
  }
  return PackUtils.fragmentDir(config, pack);
}

/**
 * Resolves the CHANGELOG file path for a given language. English uses the
 * configured changelog file; other languages use `CHANGELOG.<lang>.md` at the
 * project root.
 *
 * @private
 * @param {Object} config - Build configuration object
 * @param {string} langShort - Short language code (e.g. "en", "de")
 * @returns {string} Absolute path to the language's changelog file
 */
function _resolveChangelogFile(config, langShort) {
  if (langShort === "en") {
    return config.changelogPath;
  }
  return path.resolve(config.root, `CHANGELOG.${langShort}.md`);
}

/**
 * Generates Foundry journal pack fragments from the project's CHANGELOG files
 * (one journal per manifest language, one page per released version) into the
 * configured changelog pack's source directory, ready for `compilePacks`.
 * Disabled by default; enable via the `changelog` config option.
 *
 * @param {Object} config - Build configuration object
 * @param {Object} config.changelog - Changelog options
 * @param {boolean} config.changelog.enabled - Whether to build changelog packs
 * @param {string} config.changelog.packName - Manifest pack name to write into
 * @returns {Function} Gulp task function that accepts a done callback
 */
export const buildChangelog = (config) => async (done) => {
  if (!config.changelog.enabled) {
    log.debug("Changelog generation disabled, skipping buildChangelog.");
    done();
    return;
  }

  try {
    log.debug("Generating changelog...");
    const changelogDir = _resolveChangelogDir(config);
    const languages = _resolveLanguages(config);

    // Clear and recreate so removed versions/languages don't linger.
    fs.emptyDirSync(changelogDir);

    for (const { lang: langShort, name: langFull } of languages) {
      const changelogFile = _resolveChangelogFile(config, langShort);
      if (!fs.existsSync(changelogFile)) {
        log.warn(
          `No changelog file for '${langShort}' (${path.basename(changelogFile)}), skipping.`,
        );
        continue;
      }
      const markdown = fs.readFileSync(changelogFile, "utf-8");
      await MarkdownUtils.generateChangelogJournal(
        config,
        markdown,
        langFull,
        changelogDir,
      );
    }

    log.debug("Finished generating changelog.");
    done();
  } catch (error) {
    log.error(`Error generating changelog: ${error.message}`);
    done(error);
  }
};
