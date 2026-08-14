import fs from "fs-extra";
import path from "path";
import YAML from "js-yaml";
import prettier from "prettier";
import * as FoundryPacks from "@foundryvtt/foundryvtt-cli";
import { FileUtils } from "./FileUtils.mjs";
import log from "./logger.mjs";

/**
 * Utility class for processing Foundry VTT packs
 */
export class PackUtils {
  /**
   * Generates a random alphanumeric id of the given length, used for journal
   * and page ids when building pack fragments from non-Foundry sources (e.g.
   * the changelog journal).
   *
   * @param {number} length - The length of the id to generate
   * @returns {string} A random alphanumeric id
   */
  static generateId(length) {
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i += 1) {
      result += characters.charAt(
        Math.floor(Math.random() * characters.length),
      );
    }
    return result;
  }

  /**
   * Builds a Foundry `_stats` block from the build configuration
   * (core/system versions, timestamps, and the configured build identity).
   *
   * @private
   * @param {Object} config - Build configuration object
   * @returns {Object} A `_stats` metadata object
   */
  static #buildStats(config) {
    const timestamp = Date.now();
    return {
      coreVersion: config.manifest?.compatibility?.minimum,
      createdTime: timestamp,
      lastModifiedBy: config.packs.lastModifiedBy,
      modifiedTime: timestamp,
      systemVersion: config.version,
    };
  }

  /**
   * Returns a copy of the entry with a Foundry `_stats` block stamped on it.
   * Used when generating pack fragments that Foundry would otherwise expect to
   * carry provenance metadata (e.g. the changelog journal).
   *
   * @param {Object} config - Build configuration object
   * @param {Object} data - The pack entry to stamp
   * @returns {Object} A new object with the original data plus `_stats`
   */
  static generateStats(config, data) {
    return { ...data, _stats: PackUtils.#buildStats(config) };
  }

  /**
   * Resolves a dot-separated path within an object, returning undefined if any
   * segment is missing. Used to read Babele mapping source fields.
   *
   * @private
   * @param {Object} obj - The object to read from
   * @param {string} dotPath - Dot-separated path (e.g. "system.dvTable")
   * @returns {*} The value at the path, or undefined
   */
  static #getByPath(obj, dotPath) {
    return dotPath
      .split(".")
      .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
  }

  /**
   * Generates a sanitized filename for a pack fragment based on its data
   *
   * @private
   * @param {Object} data - The data object for the pack fragment
   * @returns {string} A sanitized filename for the fragment
   * @throws {Error} If unable to determine filename for the data
   */
  static #getFragmentName(data) {
    // Folders don't have a key, generate a dummy one.
    let key = data._key;
    if (!key) {
      key = "!folders!dummyValue";
    }
    const keyType = PackUtils.#getPackType(key);
    const { type } = data;

    const typeLower = typeof data.type === "string" ? type.toLowerCase() : "";
    const nameLower = data.name ? data.name.toLowerCase() : "";

    switch (keyType) {
      case "items":
        return FileUtils.sanitizeFilename(`${typeLower}.${nameLower}.yaml`);
      case "scenes":
        return FileUtils.sanitizeFilename(`scene.${nameLower}.yaml`);
      case "tables":
        return FileUtils.sanitizeFilename(`table.${nameLower}.yaml`);
      case "macros":
        return FileUtils.sanitizeFilename(`macro.${nameLower}.yaml`);
      case "folders":
        return FileUtils.sanitizeFilename(`folder.${nameLower}.yaml`);
      default:
        throw new Error(`Unable to determine filename for ${data}`);
    }
  }

  /**
   * Ensures generated fragment filenames stay unique within one extracted pack.
   * This protects names that sanitize to the same stem (for example variants
   * that only differ after the old truncation boundary).
   *
   * @private
   * @param {string} fragmentName - The candidate fragment filename
   * @param {Object} data - The pack entry being named
   * @param {Set<string>} usedNames - Names already claimed in this pack
   * @returns {string} A unique fragment filename
   */
  static #dedupeFragmentName(fragmentName, data, usedNames) {
    if (!usedNames.has(fragmentName)) {
      usedNames.add(fragmentName);
      return fragmentName;
    }

    const ext = path.extname(fragmentName);
    const stem = fragmentName.slice(0, -ext.length);
    const suffixes = [];

    if (data._id) {
      suffixes.push(String(data._id).toLowerCase());
    }
    if (data._key) {
      suffixes.push(
        FileUtils.sanitizeFilename(String(data._key).replaceAll("!", ".")),
      );
    }

    for (const suffix of suffixes) {
      const candidate = `${stem}.${suffix}${ext}`;
      if (!usedNames.has(candidate)) {
        usedNames.add(candidate);
        return candidate;
      }
    }

    let index = 2;
    while (usedNames.has(`${stem}.${index}${ext}`)) {
      index += 1;
    }

    const fallback = `${stem}.${index}${ext}`;
    usedNames.add(fallback);
    return fallback;
  }

  /**
   * Extracts the pack type from a key string
   *
   * @private
   * @param {string} str - The key string to extract pack type from
   * @returns {string} The extracted pack type
   */
  static #getPackType(str) {
    return str.split("!")[1].split(".")[0];
  }

  /**
   * Sanitizes and cleans up HTML description text
   * Removes unwanted characters, normalizes formatting, and trims
   * whitespace
   *
   * Order of operations is important!
   *
   * @private
   * @param {string} str - The input description string
   * @returns {string} The sanitized description
   */
  static #sanitizeDescription(str) {
    return str
      .replace(/\u2060/gu, "")
      .replace(/['']/gu, "'")
      .replace(/[""]/gu, '"')
      .replace(/&nbsp;/gu, "")
      .replace(/\sdir="ltr"/g, "")
      .replace(/<br\s*\/?>\s*(?=<br\s*\/?>)/g, "</p>\n<p>")
      .replace(/<p> /g, "<p>")
      .replace(/<\/p> +<p>/gu, "</p>\n<p>")
      .replace(/<p><br><\/p>/gu, "")
      .replace(/[^\S\n]+/g, " ")
      .replace(/^\s+|\s+$/gu, "")
      .replace(/<strong> /g, " <strong>")
      .replace(/ <\/strong>/g, "</strong> ")
      .replace(/ <\/p>/gu, "</p>")
      .replace(/<p><\/p>/gu, "");
  }

  /**
   * Transforms an entry
   *
   * @private
   * @param {Object} entry - The entry to transform
   * @returns {Object} The transformed entry
   */
  static #transformEntry(entry) {
    if (entry.system?.description) {
      const d = entry.system.description.value;
      entry.system.description.value = PackUtils.#sanitizeDescription(d);
    }
    return entry;
  }

  /**
   * Generates a Babele translation file for a pack. RollTable packs emit their
   * results (keyed by range); other packs emit name + description plus any
   * extra fields declared in `packs.babeleMappings` (e.g. an item's `dvTable`).
   *
   * @private
   * @param {Object} config - Build configuration object
   * @param {Object} packData - The pack metadata (manifest pack entry)
   * @param {string} packDir - The directory containing pack fragments
   */
  static async #generateBabelFile(config, packData, packDir) {
    const babelFile = path.resolve(
      path.join(
        config.srcDirPath,
        config.babele.dir,
        "en",
        `${config.id}.${packData.name}.json`,
      ),
    );
    const babeleData = {
      label: packData.label,
      mapping: {},
      entries: {},
    };
    const mappings = config.packs.babeleMappings || {};
    const isTable = packData.type === "RollTable";
    // Normalize fragment iteration order so regenerated Babele JSON is stable
    // across filesystems and operating systems.
    const files = fs.readdirSync(packDir).sort();

    for (const file of files) {
      log.debug(`Processing pack fragment '${packData.name}/${file}'`);
      const data = YAML.load(
        fs.readFileSync(path.join(packDir, file), "utf-8"),
      );
      const entryName = data.name;

      if (isTable) {
        const results = {};
        for (const result of data.results || []) {
          const key = Array.isArray(result.range)
            ? result.range.join("-")
            : String(result.range);
          // Foundry v13 renamed TableResult `text` to `description`. Text
          // results carry their value in `description`; document results
          // (e.g. critical-injury tables) carry it in `name`. Fall back to
          // legacy `text` for older documents.
          results[key] =
            result.description || result.name || result.text || "";
        }
        babeleData.entries[entryName] = { name: entryName, results: [results] };
        continue;
      }

      const entry = {
        name: entryName,
        description: data.system?.description?.value
          ? data.system.description.value
          : "",
      };

      // Extract any additional translatable fields declared by the consumer
      // (e.g. { dvTable: "system.dvTable" }), recording the field→path mapping.
      for (const [field, srcPath] of Object.entries(mappings)) {
        const value = PackUtils.#getByPath(data, srcPath);
        if (value !== undefined) {
          entry[field] = value;
          babeleData.mapping[field] = srcPath;
        }
      }

      babeleData.entries[entryName] = entry;
    }

    // Format through Prettier (resolving the consumer's config) so the output
    // is byte-identical to what the en source is checked against. JSON.stringify
    // alone diverges on edge cases — e.g. an empty results map serializes as a
    // multi-line `[\n  {}\n]`, which Prettier collapses to `[{}]`.
    const prettierOptions = (await prettier.resolveConfig(babelFile)) || {};
    const formatted = await prettier.format(
      JSON.stringify(babeleData, null, 2),
      {
        ...prettierOptions,
        parser: "json",
      },
    );
    fs.writeFileSync(babelFile, formatted);
  }

  /**
   * Determines the source fragment directory for a given pack. The pack's
   * `path` (e.g. "packs/black-chrome/armor") is the single source of truth: the
   * YAML source lives at `<srcDir>/<pack.path>` and the compiled pack at
   * `<buildDir>/<pack.path>`, so packs are grouped consistently and no flat
   * `source_type` directory is ever created.
   *
   * @param {Object} config - Build configuration object
   * @param {Object} packData - The pack metadata (manifest pack entry)
   * @returns {string} The path to the source fragment directory
   */
  static fragmentDir(config, packData) {
    return path.join(config.srcDirPath, packData.path);
  }

  /**
   * Extracts a Foundry VTT pack into individual YAML fragments. The consumer
   * may override fragment naming (`packs.transformName`) and entry cleaning
   * (`packs.transformEntry`); otherwise the built-in name/sanitize helpers are
   * used.
   *
   * @private
   * @param {Object} config - Build configuration object
   * @param {string} inputDir - The source directory of the pack
   * @param {string} outputDir - The target directory for extracted
   * fragments
   * @throws {Error} If extraction fails
   */
  static async #extractPack(config, inputDir, outputDir) {
    const yamlOptions = {
      indent: 2,
      sortKeys: true,
      linewidth: 80,
      noRefs: true,
      quotingType: '"',
    };

    const { transformName, transformEntry } = config.packs;
    const usedNames = new Set();

    try {
      await FoundryPacks.extractPack(inputDir, outputDir, {
        yaml: true,
        yamlOptions: yamlOptions,
        transformName:
          transformName ||
          ((entry) =>
            PackUtils.#dedupeFragmentName(
              PackUtils.#getFragmentName(entry),
              entry,
              usedNames,
            )),
        transformEntry:
          transformEntry || ((entry) => PackUtils.#transformEntry(entry)),
      });
    } catch (error) {
      error.packDir = inputDir;
      throw error;
    }
  }

  /**
   * Compiles pack fragments back into a Foundry VTT pack. Each entry is run
   * through the consumer's optional `packs.transformEntry` hook (returning
   * false discards it) and, when `packs.stats` is enabled, has a fresh
   * `_stats` block stamped on it.
   *
   * @private
   * @param {Object} config - Build configuration object
   * @param {string} fragmentDir - The directory containing pack fragments
   * @param {Object} packData - The pack metadata (manifest pack entry)
   */
  static async #compilePack(config, fragmentDir, packData) {
    if (!fs.existsSync(fragmentDir)) {
      log.error(`Fragment directory: ${fragmentDir} does not exist.`);
      return;
    }

    const { transformEntry, stats } = config.packs;

    await FoundryPacks.compilePack(
      fragmentDir,
      path.join(config.buildDirPath, packData.path),
      {
        yaml: true,
        transformEntry: async (doc) => {
          if (transformEntry && (await transformEntry(doc)) === false) {
            return false;
          }
          if (stats) {
            doc._stats = PackUtils.#buildStats(config);
          }
          return undefined;
        },
      },
    );
  }

  /**
   * Extracts all packs defined in the module configuration. Clears
   * existing fragment directories before extraction and clears Babele
   * translation files before regeneration.
   *
   * @param {Function} done - Callback to signal completion of extraction
   */
  static extractPacks = (config) => async (done) => {
    const packs = config.manifest.packs;
    const babeleEnabled = config.babele.enabled;
    const babelDir = path.join(config.srcDirPath, config.babele.dir, "en");
    const excludePacks = config.packs.excludePacks || [];
    const generatedPacks = config.packs.generatedPacks || [];

    try {
      // Clear Babele en directory before generating new files
      if (babeleEnabled) {
        fs.emptyDirSync(babelDir);
      }

      for (const p of packs) {
        // Packs produced by other build tasks (e.g. the changelog journal)
        // are never round-tripped through extraction.
        if (generatedPacks.includes(p.name)) {
          continue;
        }

        const packsFragmentDir = PackUtils.fragmentDir(config, p);
        const packsBuildDir = path.join(config.buildDirPath, p.path);

        // Clear fragment directory before extracting
        fs.emptyDirSync(packsFragmentDir);

        await PackUtils.#extractPack(config, packsBuildDir, packsFragmentDir);
        if (babeleEnabled && !excludePacks.includes(p.name)) {
          await PackUtils.#generateBabelFile(config, p, packsFragmentDir);
        }
      }
      done();
    } catch (error) {
      // LevelDB lock errors occur when Foundry VTT is still running
      if (
        error.message.includes("Iterator is not open") ||
        error.message.includes("LOCK")
      ) {
        log.error(
          `Cannot access pack at ${error.packDir}. Is Foundry VTT still running? Close Foundry and try again.`,
        );
        const silent = new Error("");
        silent.name = "";
        silent.stack = "";
        silent.showStack = false;
        done(silent);
      } else {
        log.error(`Error during pack extraction: ${error.message}`);
        done(error);
      }
    }
  };

  /**
   * Compiles all packs defined in the module configuration
   *
   * @param {Function} done - Callback to signal completion of compilation
   */
  static compilePacks = (config) => async (done) => {
    const packs = config.manifest.packs;

    for (const p of packs) {
      const fragmentDir = PackUtils.fragmentDir(config, p);
      await PackUtils.#compilePack(config, fragmentDir, p);
    }
    done();
  };
}
