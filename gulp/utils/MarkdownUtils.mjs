import fs from "fs-extra";
import path from "path";
import YAML from "js-yaml";
import { marked } from "marked";
import { PackUtils } from "./PackUtils.mjs";
import { FileUtils } from "./FileUtils.mjs";
import log from "./logger.mjs";

/**
 * Utility class for turning Markdown documents (such as CHANGELOG and CREDITS)
 * into Foundry VTT journal pack fragments.
 */
export class MarkdownUtils {
  /**
   * Extracts and formats a version number from a heading string such as
   * "Version: 1.2.3", returning it as "v1.2.3". Two-part versions are padded
   * to three parts.
   *
   * @param {string} input - Heading string that may contain a version
   * @returns {string} Formatted version (e.g. "v1.2.3") or "Unknown"
   */
  static getVersion(input) {
    const versionRegex = /Version\s*:? (\d+\.\d+\.\d+)/;
    const match = input.match(versionRegex);

    if (match) {
      const versionParts = match[1].split(".");
      if (versionParts.length === 2) {
        versionParts.push("0");
      }
      return `v${versionParts.join(".")}`;
    }

    return "Unknown";
  }

  /**
   * Splits Markdown by heading level, returning each heading title (with
   * leading `#` characters stripped) and the content up to the next heading
   * in the configured level range.
   *
   * @param {string} markdown - The Markdown text to split
   * @param {number} [minLevel=1] - Minimum heading level to match
   * @param {number} [maxLevel=2] - Maximum heading level to match
   * @returns {Array<{heading: string, level: number, content: string}>} Parsed sections
   */
  static markdownToJson(markdown, minLevel = 1, maxLevel = 2) {
    const headingRegex = new RegExp(
      `^(#{${minLevel},${maxLevel}})\\s+(.+)$`,
      "gm",
    );
    const matches = [...markdown.matchAll(headingRegex)];

    return matches.map((match, index) => {
      const level = match[1].length;
      const heading = match[2].trim();
      const startIndex = match.index + match[0].length;
      const endIndex =
        index + 1 < matches.length ? matches[index + 1].index : markdown.length;
      const content = markdown.slice(startIndex, endIndex).trim();

      return { heading, level, content };
    });
  }

  /**
   * Builds and writes a single Foundry JournalEntry YAML fragment (with
   * embedded text pages) to the given output directory.
   *
   * @param {Object} config - Build configuration object
   * @param {Object} journalOptions - Journal construction options
   * @param {string} journalOptions.name - Display name of the JournalEntry
   * @param {string} journalOptions.slug - Filename slug (`journal.<slug>.yaml`)
   * @param {Array<{name: string, sort: number, content: string}>} journalOptions.sections - Page definitions
   * @param {string} journalOptions.outDir - Directory to write the YAML fragment into
   */
  static writeJournalFragment(config, { name, slug, sections, outDir }) {
    const journalId = PackUtils.generateId(16);

    // Pages are embedded in the journal document (one fragment per journal), as
    // the Foundry CLI expects — it derives the per-page LevelDB keys on compile.
    const pages = sections.map((section) => {
      const pageId = PackUtils.generateId(16);
      const page = {
        sort: section.sort,
        name: section.name,
        type: "text",
        _id: pageId,
        // Embedded children still need their own `_key`; the CLI walks the
        // whole document hierarchy and reads `_key` on every node.
        _key: `!journal.pages!${journalId}.${pageId}`,
        title: { show: true, level: 1 },
        image: {},
        text: { format: 1, content: marked.parse(section.content) },
        video: { controls: true, volume: 0.5 },
        src: null,
        category: null,
        system: {},
        ownership: { default: -1 },
        flags: {},
      };
      return PackUtils.generateStats(config, page);
    });

    const journal = PackUtils.generateStats(config, {
      _id: journalId,
      _key: `!journal!${journalId}`,
      name,
      pages,
      folder: null,
      categories: [],
      sort: 0,
      ownership: { default: 0 },
      flags: {
        core: {
          viewMode: "JournalSheet.VIEW_MODES.MULTIPLE",
        },
      },
    });

    fs.writeFileSync(
      path.resolve(outDir, `journal.${slug}.yaml`),
      YAML.dump(journal),
    );

    return pages.length;
  }

  /**
   * Generates a changelog journal (and its pages) as a YAML pack fragment from
   * the provided Markdown content, writing it into the output directory.
   *
   * @param {Object} config - Build configuration object
   * @param {string} markdown - Markdown CHANGELOG content for this language
   * @param {string} lang - Language display name (e.g. "English")
   * @param {string} outDir - Directory to write the YAML fragment into
   * @returns {Promise<void>}
   */
  static async generateChangelogJournal(config, markdown, lang, outDir) {
    const rawSections = MarkdownUtils.markdownToJson(markdown, 2, 2);
    const langSlug = FileUtils.sanitizeFilename(lang);

    const sections = [];
    for (const entry of rawSections) {
      const version = MarkdownUtils.getVersion(entry.heading);
      if (version === "Unknown") {
        continue;
      }
      sections.push({
        name: version,
        sort: Number(version.replace(/[v.]+/g, "")) * 100,
        content: entry.content,
      });
    }

    const pageCount = MarkdownUtils.writeJournalFragment(config, {
      name: `Changelog ${lang}`,
      slug: langSlug,
      sections,
      outDir,
    });
    log.debug(
      `Generated changelog journal for '${lang}' (${pageCount} pages).`,
    );
  }

  /**
   * Generates a credits journal (and its pages) as a YAML pack fragment from
   * the provided Markdown content, writing it into the output directory.
   *
   * @param {Object} config - Build configuration object
   * @param {string} markdown - Markdown CREDITS content
   * @param {string} outDir - Directory to write the YAML fragment into
   * @returns {Promise<void>}
   */
  static async generateCreditsJournal(config, markdown, outDir) {
    const rawSections = MarkdownUtils.markdownToJson(markdown, 1, 2);

    const sections = rawSections.map((entry, index) => ({
      name: entry.heading,
      sort: (index + 1) * 100,
      content: entry.content,
    }));

    const pageCount = MarkdownUtils.writeJournalFragment(config, {
      name: "Credits",
      slug: "credits",
      sections,
      outDir,
    });
    log.debug(`Generated credits journal (${pageCount} pages).`);
  }
}
