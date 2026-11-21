import fs from "fs";
import path from "path";
import log from "fancy-log";
import chalk from "chalk";
import { format } from "date-fns";

/**
 * Configuration manager for CPRC Foundry Project Build Systems
 */
class Config {
  // Set defaults if no options passed.
  static VARS_FILE = "vars.env";
  static FOUNDRY_CONFIG = "foundryconfig.json";
  static MANIFEST_FILE = "src/module.json";
  static CHANGELOG_FILE = "CHANGELOG.md";
  static CREDITS_FILE = "CREDITS.md";
  static DEFAULT_VERSION = "v0.0.0dev";
  static SRC_DIR = "src";
  static BUILD_DIR = "dist";
  static STATIC_EXTS = [".json", ".hbs", ".css", ".js"];
  static EXCLUDE_DIRS = [];
  static IMAGE_EXTS = [".svg", ".png", ".webp"];
  static BABELE = { enabled: false, dir: "babele" };
  static CSS = { enabled: false, entry: "css/main.css", out: "css/main.css" };
  static CHANGELOG = { enabled: false, packName: "changelog" };
  static CREDITS = { enabled: false, packName: "credits" };
  static DEV_MODE = {
    enabled: false,
    outPath: "modules/system/devMode.js",
    defaults: {},
  };
  static PACKS = {
    transformEntry: null,
    transformName: null,
    excludePacks: [],
    generatedPacks: [],
    stats: false,
    lastModifiedBy: "0000000000000000",
  };
  static CI = process.env.CI || false;
  static CI_COMMIT_TAG = process.env.CI_COMMIT_TAG || undefined;
  static GITLAB_CI = process.env.GITLAB_CI || false;
  static GITLAB_HOST = process.env.CI_SERVER_FQDN || "example.com";
  static GITLAB_GROUP_NAME = process.env.CI_PROJECT_NAMESPACE || "group";
  static GITLAB_PROJECT_NAME = process.env.CI_PROJECT_NAME || "project";
  static GITLAB_PROJECT_ID = process.env.CI_PROJECT_ID || "0123456789";

  /**
   * Creates a new Config instance with optional configuration overrides.
   * @param {Object} [options={}] - Configuration options to override defaults
   * @param {string} [options.varsFile] - vars file used by gitlab scripts
   * @param {string} [options.foundryConfig] - Path to the foundry config file
   * @param {string} [options.manifestFile] - Path to the manifest file
   * @param {string} [options.changelogFile] - Path to the changelog file
   * @param {string} [options.creditsFile] - Path to the credits file
   * @param {string} [options.srcDir] - Source directory name
   * @param {string} [options.buildDir] - Build directory name
   * @param {string[]} [options.staticExts] - File extensions to copy to build
   * @param {string[]} [options.excludeDirs] - Directories to exclude (applies to both static assets and images)
   * @param {string[]} [options.imageExts] - Array of supported image file extensions
   * @param {Object} [options.babele] - Babele translation file generation options
   * @param {boolean} [options.babele.enabled] - Whether to generate Babele files (default: false)
   * @param {string} [options.babele.dir] - Directory for Babele files relative to srcDir (default: "babele")
   * @param {Object} [options.css] - CSS/PostCSS pipeline options
   * @param {boolean} [options.css.enabled] - Whether to compile CSS with PostCSS (default: false)
   * @param {string} [options.css.entry] - Entry CSS file relative to srcDir (default: "css/main.css")
   * @param {string} [options.css.out] - Output CSS file relative to buildDir (default: "css/main.css")
   * @param {Object} [options.changelog] - Changelog journal generation options
   * @param {boolean} [options.changelog.enabled] - Whether to build changelog journals (default: false)
   * @param {string} [options.changelog.packName] - Manifest pack name to write journals into (default: "changelog")
   * @param {Object} [options.credits] - Credits journal generation options
   * @param {boolean} [options.credits.enabled] - Whether to build credits journal (default: false)
   * @param {string} [options.credits.packName] - Manifest pack name to write journal into (default: "credits")
   * @param {Object} [options.devMode] - DevMode module generation options
   * @param {boolean} [options.devMode.enabled] - Whether to generate the devMode module (default: false)
   * @param {string} [options.devMode.outPath] - Output path relative to buildDir (default: "modules/system/devMode.js")
   * @param {Object} [options.devMode.defaults] - Default devMode object merged under foundryconfig's devMode
   * @param {Object} [options.packs] - Pack extract/compile options
   * @param {Function} [options.packs.transformEntry] - Hook to clean/transform each entry on compile
   * @param {Function} [options.packs.transformName] - Hook to name each fragment on extract
   * @param {string[]} [options.packs.excludePacks] - Pack names to skip when generating Babele files
   * @param {string[]} [options.packs.generatedPacks] - Pack names produced by other build tasks; skipped entirely on extract (never round-tripped)
   * @param {boolean} [options.packs.stats] - Whether to stamp `_stats` on entries during compile (default: false)
   * @param {string} [options.packs.lastModifiedBy] - Identity stamped into `_stats.lastModifiedBy`
   * @param {string} [options.defaultVersion] - Default version string
   * @param {string} [options.gitlabHost] - GitLab host URL
   * @param {string} [options.gitlabProjectId] - GitLab project ID
   * @param {string} [options.gitlabProjectName] - GitLab project name
   * @param {string} [options.gitlabGroupName] - GitLab group name
   */
  constructor(options = {}) {
    this._varsFile = options.varsFile || Config.VARS_FILE;
    this._foundryConfig = options.foundryConfig || Config.FOUNDRY_CONFIG;
    this._manifestFile = options.manifestFile || Config.MANIFEST_FILE;
    this._changelogFile = options.changelogFile || Config.CHANGELOG_FILE;
    this._creditsFile = options.creditsFile || Config.CREDITS_FILE;
    this._srcDir = options.srcDir || Config.SRC_DIR;
    this._buildDir = options.buildDir || Config.BUILD_DIR;
    this._staticExts = options.staticExts || Config.STATIC_EXTS;
    this._excludeDirs = options.excludeDirs || Config.EXCLUDE_DIRS;
    this._imageExts = options.imageExts || Config.IMAGE_EXTS;
    this._babele = { ...Config.BABELE, ...options.babele };
    this._css = { ...Config.CSS, ...options.css };
    this._changelog = { ...Config.CHANGELOG, ...options.changelog };
    this._credits = { ...Config.CREDITS, ...options.credits };
    this._devMode = { ...Config.DEV_MODE, ...options.devMode };
    this._packs = { ...Config.PACKS, ...options.packs };
    this._defaultVersion = options.defaultVersion || Config.DEFAULT_VERSION;
    this._gitlabHost = options.gitlabHost || Config.GITLAB_HOST;
    this._gitlabProjectId = options.gitlabProjectId || Config.GITLAB_PROJECT_ID;
    this._gitlabProjectName =
      options.gitlabProjectName || Config.GITLAB_PROJECT_NAME;
    this._gitlabGroupName = options.gitlabGroupName || Config.GITLAB_GROUP_NAME;
  }

  /**
   * Finds the project root by searching for package.json or .git
   *
   * @returns {string} Resolved path to project root
   * @throws {Error} If project root cannot be found
   */
  #findProjectRoot() {
    let currentDir = process.cwd();

    while (currentDir !== path.parse(currentDir).root) {
      // Check for package.json or .git directory
      if (
        fs.existsSync(path.join(currentDir, "package.json")) ||
        fs.existsSync(path.join(currentDir, ".git"))
      ) {
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }

    throw new Error(
      "Could not find project root (no package.json or .git found)",
    );
  }

  /**
   * Loads and parses the manifest file
   *
   * @returns {Object} Parsed manifest data
   * @throws {Error} If manifest cannot be read or parsed
   */
  #loadManifestData() {
    try {
      const filePath = path.join(this.root, this._manifestFile);
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const manifest = JSON.parse(fileContent);
      return manifest;
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(`Manifest file not found: ${error.path}`, {
          cause: error,
        });
      } else if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in manifest file: ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  /**
   * Loads and parses the foundryConfig file
   *
   * @returns {Object} Parsed foundryConfig OR Empty Object if file not found
   * @throws {Error} If manifest cannot be parsed as valid JSON
   */
  #loadFoundryConfig() {
    if (this._cachedFoundryConfig !== undefined) {
      return this._cachedFoundryConfig;
    }

    try {
      const filePath = path.join(this.root, this._foundryConfig);
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const config = JSON.parse(fileContent);
      this.#warnForLegacyFoundryConfig(config);
      this._cachedFoundryConfig = config;
      return config;
    } catch (error) {
      if (error.code === "ENOENT") {
        log(
          `${chalk.yellow("WARNING")} ${this._foundryConfig} not found. Using defaults.`,
        );
        this._cachedFoundryConfig = {};
        return {};
      } else if (error instanceof SyntaxError) {
        throw new Error(
          `Invalid JSON in Foundry Config file: ${error.message}`,
          {
            cause: error,
          },
        );
      }
      throw error;
    }
  }

  /**
   * Warns when a Foundry config uses deprecated top-level path keys and notes
   * when nested `foundry.*` keys override conflicting legacy values.
   *
   * @param {Object} config - Parsed foundry config file
   */
  #warnForLegacyFoundryConfig(config) {
    if (!config || Array.isArray(config) || typeof config !== "object") {
      return;
    }

    const legacyKeys = ["dataPath", "versionPrefix"].filter((key) =>
      Object.prototype.hasOwnProperty.call(config, key),
    );
    if (!legacyKeys.length) {
      return;
    }

    const foundry =
      config.foundry && !Array.isArray(config.foundry) ? config.foundry : {};
    const conflictingKeys = legacyKeys.filter(
      (key) =>
        Object.prototype.hasOwnProperty.call(foundry, key) &&
        foundry[key] !== config[key],
    );
    const quotedLegacyKeys = legacyKeys.map((key) => `"${key}"`).join(", ");

    if (conflictingKeys.length) {
      const quotedConflictingKeys = conflictingKeys
        .map((key) => `"${key}"`)
        .join(", ");
      log(
        `${chalk.yellow("WARNING")} ${this._foundryConfig} uses deprecated top-level ${quotedLegacyKeys}. Nested foundry.${quotedConflictingKeys} ${conflictingKeys.length === 1 ? "takes" : "take"} precedence over the conflicting legacy ${conflictingKeys.length === 1 ? "value" : "values"}.`,
      );
      return;
    }

    log(
      `${chalk.yellow("WARNING")} ${this._foundryConfig} uses deprecated top-level ${quotedLegacyKeys}. They are still supported for backwards compatibility, but should be moved under "foundry", for example {"foundry":{"dataPath":"/path/to/Foundry/{VERSION}","versionPrefix":"V"}}.`,
    );
  }

  /**
   * Resolves Foundry path settings from the preferred nested config shape,
   * falling back to deprecated top-level keys for backwards compatibility.
   *
   * @param {Object} config - Parsed foundry config file
   * @returns {Object} Resolved Foundry settings
   */
  #getFoundrySettings(config = this.foundryConfig) {
    const foundry =
      config?.foundry && !Array.isArray(config.foundry) ? config.foundry : {};

    return {
      dataPath: foundry.dataPath ?? config?.dataPath,
      versionPrefix: foundry.versionPrefix ?? config?.versionPrefix ?? "v",
    };
  }

  /**
   * Generates the zip file name based on project id and version.
   * @returns {string} The zip file name
   */
  #generateZipName() {
    const zipFile = `${this.id}-${this.version}.zip`;
    return zipFile;
  }

  /**
   * Generates GitLab URLs for the project, manifest, and download.
   * @returns {Object} Object containing GitLab URLs
   * @returns {string} return.url - Project URL
   * @returns {string} return.manifest - Manifest URL
   * @returns {string} return.download - Download URL
   */
  #generateGitlabUrls() {
    const zipFile = this.zipName;
    const manifestFile = path.basename(this._manifestFile);
    const baseUrl = `https://${this._gitlabHost}`;
    const groupUrl = `${baseUrl}/${this._gitlabGroupName}`;
    const projectUrl = `${groupUrl}/${this._gitlabProjectName}`;
    const apiUrl = `${baseUrl}/api/v4`;
    const packageUrl = `${apiUrl}/projects/${this._gitlabProjectId}/packages/generic/${this.id}`;
    const manifestUrl = `${packageUrl}/latest/${manifestFile}`;
    const zipUrl = `${packageUrl}/${this.version}/${zipFile}`;

    const url = projectUrl;
    const manifest = manifestUrl;
    const download = zipUrl;

    const output = {
      url: url,
      repoUrl: packageUrl,
      manifest: manifest,
      download: download,
    };

    return output;
  }

  /**
   * Determines the version string based on priority order: CI tag, CI date, manifest version, or default.
   *
   * @private
   * @returns {string} The determined version string
   */
  #getVersion() {
    // 1st priority: CI tag
    if (Config.CI && Config.CI_COMMIT_TAG) {
      return process.env.CI_COMMIT_TAG;
    }

    // 2nd priority: Date version, if we're in CI but no tag this is probably a
    // dev build
    if (Config.CI && !Config.CI_COMMIT_TAG) {
      return `v${format(new Date(), "yyyyMMdd.HHmm")}`;
    }

    // 3rd priority: manifest version
    try {
      const manifest = this.manifest;
      if (manifest.version) {
        return manifest.version;
      }
    } catch {
      // just skip errors as we don't care here.
    }

    // 4th priority: default
    return this._defaultVersion;
  }

  /**
   * Formats the manifest's Foundry compatibility version for path
   * interpolation.
   *
   * @returns {string} Compatibility version with the configured prefix applied
   * @throws {Error} If `{VERSION}` is used but compatibility.verified is unset
   */
  #getFoundryVersionValue() {
    const { versionPrefix } = this.#getFoundrySettings();
    const compatibilityVersion = this.manifest?.compatibility?.verified;

    if (compatibilityVersion === undefined || compatibilityVersion === null) {
      throw new Error(
        "Cannot expand `{VERSION}` in Foundry paths: manifest `compatibility.verified` is not set.",
      );
    }

    const version = String(compatibilityVersion);
    if (/^[vV]/.test(version)) {
      return `${versionPrefix}${version.slice(1)}`;
    }

    return `${versionPrefix}${version}`;
  }

  /**
   * Replaces every VERSION placeholder in a Foundry data path template.
   *
   * @param {string} dataPath - Foundry data path template
   * @returns {string} Interpolated data path
   */
  #interpolateFoundryDataPath(dataPath) {
    if (typeof dataPath !== "string" || !dataPath.includes("{VERSION}")) {
      return dataPath;
    }

    return dataPath.split("{VERSION}").join(this.#getFoundryVersionValue());
  }

  /**
   * Gets the absolute path to the project root directory.
   *
   * @returns {string} Absolute path to the project root
   */
  get root() {
    return path.resolve(this.#findProjectRoot());
  }

  /**
   * Gets the build directory path. When a Foundry data path is available the
   * build deploys into `<dataPath>/Data/<type>s/<id>`; otherwise it falls back
   * to the configured build directory. The data path is resolved, in order,
   * from the `FOUNDRY_DATA_PATH` env var (used by the test harness for an
   * isolated dir), then `foundryconfig.json`'s nested `foundry.dataPath`
   * block, then the deprecated top-level `dataPath` key. All `{VERSION}`
   * placeholders in the selected path are interpolated using the manifest's
   * `compatibility.verified` value and the resolved `versionPrefix`
   * (`foundry.versionPrefix`, then legacy `versionPrefix`, then `"v"`).
   *
   * @returns {string} Resolved path to build directory
   */
  get buildDirPath() {
    const config = this.#loadFoundryConfig();
    const { dataPath: configuredDataPath } = this.#getFoundrySettings(config);
    const dataPath = process.env.FOUNDRY_DATA_PATH || configuredDataPath;
    if (dataPath) {
      const moduleType = path.basename(
        this._manifestFile,
        path.extname(this._manifestFile),
      );
      const resolvedDataPath = this.#interpolateFoundryDataPath(dataPath);
      return path.resolve(
        path.join(resolvedDataPath, "Data", `${moduleType}s`, this.id),
      );
    }
    return path.resolve(this.root, this._buildDir);
  }

  /**
   * Gets the source directory path
   *
   * @returns {string} Resolved path to source directory
   */
  get srcDirPath() {
    return path.resolve(this.root, this._srcDir);
  }

  /**
   * Gets the full manifest object
   *
   * @returns {Object} Complete manifest data
   */
  get manifest() {
    if (!this._cachedManifest) {
      this._cachedManifest = this.#loadManifestData();
    }
    return this._cachedManifest;
  }

  /**
   * Gets version from CI environment, manifest, or default
   *
   * @returns {string} Version string
   */
  get version() {
    return this.#getVersion();
  }

  /**
   * Gets the project ID from manifest
   *
   * @returns {string} Project ID
   * @throws {Error} If id is not defined in manifest
   */
  get id() {
    const manifest = this.manifest;
    if (!manifest.id) {
      throw new Error("Module id is not defined in manifest file");
    }
    return manifest.id;
  }

  /**
   * Gets the project title from manifest
   *
   * @returns {string} Project title
   * @throws {Error} If title is not defined in manifest
   */
  get title() {
    const manifest = this.manifest;
    if (!manifest.title) {
      throw new Error("Module title is not defined in manifest file");
    }
    return manifest.title;
  }

  /**
   * Gets the static file extensions to copy during build.
   *
   * @returns {string[]} Array of static file extensions (e.g., [".json", ".hbs", ".css", ".js"])
   */
  get staticExts() {
    return [...this._staticExts];
  }

  /**
   * Gets the directories to exclude from static asset and image processing.
   *
   * @returns {string[]} Array of directory names/paths to exclude
   */
  get excludeDirs() {
    return [...this._excludeDirs];
  }

  /**
   * Gets the supported image file extensions for processing.
   *
   * @returns {string[]} Array of supported image extensions (e.g., [".svg", ".png", ".webp"])
   */
  get imageExts() {
    return [...this._imageExts];
  }

  /**
   * Gets the Babele translation file generation options.
   *
   * @returns {Object} Babele options with enabled and dir properties
   */
  get babele() {
    return { ...this._babele };
  }

  /**
   * Gets the CSS/PostCSS pipeline options.
   *
   * @returns {Object} CSS options with enabled, entry, and out properties
   */
  get css() {
    return { ...this._css };
  }

  /**
   * Gets whether the build is running in a CI environment.
   *
   * @returns {boolean} True when running under CI
   */
  get ci() {
    return Boolean(Config.CI);
  }

  /**
   * Gets the changelog journal generation options.
   *
   * @returns {Object} Changelog options with enabled and packName properties
   */
  get changelog() {
    return { ...this._changelog };
  }

  /**
   * Gets the credits journal generation options.
   *
   * @returns {Object} Credits options with enabled and packName properties
   */
  get credits() {
    return { ...this._credits };
  }

  /**
   * Gets the devMode module generation options.
   *
   * @returns {Object} DevMode options with enabled, outPath, and defaults
   */
  get devMode() {
    return { ...this._devMode };
  }

  /**
   * Gets the parsed `foundryconfig.json` (or an empty object when absent).
   *
   * @returns {Object} Parsed foundry config
   */
  get foundryConfig() {
    return this.#loadFoundryConfig();
  }

  /**
   * Gets the pack processing options (extract/compile hooks, Babele
   * exclusions, and `_stats` stamping). The returned object preserves the
   * original hook function references.
   *
   * @returns {Object} Pack options
   */
  get packs() {
    return { ...this._packs };
  }

  /**
   * Gets the path to the changelog file.
   *
   * @returns {string} Resolved path to the changelog file
   */
  get changelogPath() {
    return path.resolve(path.join(this.root, this._changelogFile));
  }

  /**
   * Gets the path to the credits file.
   *
   * @returns {string} Resolved path to the credits file
   */
  get creditsPath() {
    return path.resolve(path.join(this.root, this._creditsFile));
  }

  /**
   * Gets the generated zip file name.
   * @returns {string} The zip file name
   */
  get zipName() {
    return this.#generateZipName();
  }

  /**
   * Gets the release name (zip basename without extension), used as the
   * top-level directory name inside the release archive.
   * @returns {string} The release name
   */
  get releaseName() {
    return `${this.id}-${this.version}`;
  }

  /**
   * Gets the GitLab generic package base URL for this project's package.
   * Release artifacts are uploaded under `{repoUrl}/{version}/{file}` and the
   * latest manifest under `{repoUrl}/latest/{manifest}`.
   * @returns {string} The package base URL
   */
  get repoUrl() {
    return this.#generateGitlabUrls().repoUrl;
  }

  /**
   * Gets the `latest` manifest URL for this project's package.
   * @returns {string} The manifest URL
   */
  get manifestUrl() {
    return this.#generateGitlabUrls().manifest;
  }

  /**
   * Gets the versioned download (zip) URL for this project's package.
   * @returns {string} The download URL
   */
  get downloadUrl() {
    return this.#generateGitlabUrls().download;
  }

  /**
   * Gets the path of the vars.env file used by the CI system
   * @returns {path} The path to the varsFile
   */
  get varsFile() {
    return path.join(this.root, this._varsFile);
  }

  /**
   * Gets the distribution manifest with GitLab URLs added.
   * @returns {Object} The manifest object with url, manifest, and download properties
   */
  get generateManifest() {
    const gitlab = this.#generateGitlabUrls();
    const manifest = { ...this.manifest };
    if (!Config.CI_COMMIT_TAG) {
      manifest.relationships = {};
    }
    return {
      ...manifest,
      url: gitlab.url,
      manifest: gitlab.manifest,
      download: gitlab.download,
    };
  }
}

export default Config;
