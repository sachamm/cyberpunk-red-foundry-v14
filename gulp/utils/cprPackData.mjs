import { formatFoundryHtml } from "./FoundryTextUtils.mjs";
import log from "./logger.mjs";

/**
 * CPR-specific pack entry cleaning, provided as an opt-in `packs.transformEntry`
 * hook so the generic build system stays project-agnostic. A consumer wires it
 * in their config:
 *
 *   import { cprTransformEntry } from "./gulp/utils/cprPackData.mjs";
 *   new Config({ packs: { transformEntry: cprTransformEntry, stats: true } });
 *
 * It strips Foundry metadata we don't ship, normalizes item usage/effect
 * fields, coerces stringly-typed numbers, and tidies description HTML. The hook
 * mutates the entry in place (the Foundry CLI uses the mutated object) and
 * never discards entries.
 */

/** Item types that carry active effects and a meaningful `usage` value. */
const ITEMS_WITH_EFFECTS = [
  "armor",
  "clothing",
  "cyberware",
  "criticalInjury",
  "drug",
  "gear",
  "program",
  "weapon",
];

/** Valid non-"owned"/"carried" usage values, defaulted to "equipped". */
const DEFAULT_USAGE = "equipped";

/** Physical-possession usages that compendium items should never carry. */
const PHYSICAL_USAGE = ["owned", "carried"];

/** Ownership block used for embedded installed items in compendium source. */
const DEFAULT_OWNERSHIP = { default: 0 };

/**
 * Extracts the pack type (e.g. "items") from a LevelDB key such as
 * "!items!abc" or "!items.effects!abc.def".
 *
 * @param {string} key - The entry's `_key`
 * @returns {string} The pack type
 */
function getPackType(key) {
  return key.split("!")[1].split(".")[0];
}

/**
 * Normalizes text/HTML fields, smoothing out quirks introduced by
 * Foundry/browsers/operating systems/users. Order of operations matters.
 *
 * @param {string} str - The string to clean
 * @returns {string} The cleaned string
 */
function cleanString(str) {
  return str
    .replace(/\u2060/gu, "")
    .replace(/[‘’]/gu, "'")
    .replace(/[“”]/gu, '"')
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
 * Applies item-specific normalization: removes stray runtime fields, fixes
 * weapon/cyberware quirks, and enforces `revealed`/`usage` for effect-bearing
 * item types.
 *
 * @param {Object} entry - The item pack entry (mutated in place)
 */
function normalizeItem(entry) {
  if (entry.system) {
    delete entry.system.allowedUsage;
    delete entry.system.dvTableNames;
    delete entry.system.isGM;
    delete entry.system.isOwned;
    delete entry.system.relativeSkills;
    delete entry.system.tags;
  }

  if (entry.type === "weapon") {
    entry.system.ammoVariety = entry.system.ammoVariety.filter((i) => i !== "");
  }

  // Effect-bearing items must be revealed and must never carry a
  // physical-possession usage on a compendium item. Model fields are not
  // deleted — fragments are complete documents.
  if (ITEMS_WITH_EFFECTS.includes(entry.type)) {
    entry.system.revealed = true;
    if (
      !("usage" in entry.system) ||
      PHYSICAL_USAGE.includes(entry.system.usage)
    ) {
      entry.system.usage = DEFAULT_USAGE;
    }
  }
}

/**
 * Coerces stringly-typed numeric fields to integers.
 *
 * @param {Object} entry - The item pack entry (mutated in place)
 */
function coerceNumbers(entry) {
  if (entry.system?.source?.page) {
    entry.system.source.page = parseInt(entry.system.source.page, 10);
  }
  if (entry.system?.amount) {
    entry.system.amount = parseInt(entry.system.amount, 10);
  }
  if (entry.system?.price) {
    entry.system.price.market = parseInt(entry.system.price.market, 10);
  }
  if (entry.system?.rank) {
    entry.system.rank = parseInt(entry.system.rank, 10);
  }
  if (entry.system?.humanityLoss?.static) {
    entry.system.humanityLoss.static = parseInt(
      entry.system.humanityLoss.static,
      10,
    );
  }
}

/**
 * Recursively sanitizes embedded installed-item data so extracted compendium
 * fragments never capture user-specific ownership ids from a developer's
 * world.
 *
 * @param {Object} entry - The item pack entry (mutated in place)
 */
function sanitizeInstalledOwnership(entry) {
  if (!entry || typeof entry !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(entry)) {
    if (key !== "cprInstallTree") {
      sanitizeInstalledOwnership(value);
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    for (const installedItem of value) {
      if (!installedItem || typeof installedItem !== "object") {
        continue;
      }
      installedItem.ownership = { ...DEFAULT_OWNERSHIP };
      sanitizeInstalledOwnership(installedItem);
    }
  }
}

/**
 * Cleans a CPR pack entry in place. Intended to be passed as
 * `packs.transformEntry`. Returns nothing so the entry is always kept.
 *
 * @param {Object} entry - The pack entry to clean (mutated in place)
 * @returns {Promise<void>}
 */
export async function cprTransformEntry(entry) {
  // Document-level metadata (author/folder/ownership/sort/flags/...) is kept —
  // fragments are complete Foundry documents. `_stats` is the exception: it is
  // build-time provenance, so it's dropped from source and stamped only when
  // compiling the packs. Embedded installed items are also normalized so their
  // ownership never leaks developer-specific user ids into `cprInstallTree`.
  delete entry._stats;
  sanitizeInstalledOwnership(entry);

  if (entry._key && getPackType(entry._key) === "items") {
    normalizeItem(entry);

    if (entry.name) entry.name = cleanString(entry.name);
    if (entry.label) entry.label = cleanString(entry.label);
    if (entry.system?.description?.value) {
      const cleaned = cleanString(entry.system.description.value);
      try {
        entry.system.description.value = await formatFoundryHtml(cleaned);
      } catch (error) {
        // Foundry/user-authored HTML can be malformed (e.g. void elements with
        // end tags). Keep the cleaned-but-unformatted value rather than fail
        // the whole build.
        log.warn(
          `cprPackData: could not format description for '${entry.name}', keeping it unformatted (${error.message})`,
        );
        entry.system.description.value = cleaned;
      }
    }

    coerceNumbers(entry);
  }
}
