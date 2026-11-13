import gulp from "gulp";
import * as BuildTools from "./gulp/build.mjs";
import * as ImageTools from "./gulp/images.mjs";
import * as CssTools from "./gulp/css.mjs";
import { buildChangelog } from "./gulp/changelog.mjs";
import { PackUtils } from "./gulp/utils/PackUtils.mjs";
import { cprTransformEntry } from "./gulp/utils/cprPackData.mjs";
import Config from "./tools/release/config.mjs";

// DevMode defaults are project-specific, so they live here rather than in the
// shared build system. Merged with any `devMode` block in foundryconfig.json.
const DEV_MODE_DEFAULTS = {
  migrations: {
    enforceMinimumVersion: true,
    remigrateAlreadyMigrated: false,
    batchMigrations: true,
    migrateSystemCompendia: false,
    simulateMigrationError: false,
    app: {
      returnToSetup: true,
      modal: true,
    },
  },
};

const config = new Config({
  manifestFile: "src/system.json",
  // Code, data, templates, and fonts are copied as-is; CSS is compiled and
  // images are processed by their own tasks; packs are compiled.
  staticExts: [".js", ".json", ".hbs", ".ttf"],
  imageExts: [".svg", ".png", ".webp", ".jpg", ".jpeg", ".webm"],
  excludeDirs: ["packs"],
  css: { enabled: true },
  changelog: { enabled: true, packName: "other_changelog" },
  devMode: {
    enabled: true,
    outPath: "modules/system/devMode.js",
    defaults: DEV_MODE_DEFAULTS,
  },
  babele: { enabled: true },
  packs: {
    transformEntry: cprTransformEntry,
    stats: true,
    lastModifiedBy: "00CPRCBuildBot00",
    excludePacks: [
      "internal_skills",
      "other_changelog",
      "other_scenes",
      "other_macros",
    ],
    generatedPacks: ["other_changelog"],
    babeleMappings: { dvTable: "system.dvTable" },
  },
});

gulp.task("generateEnvFile", BuildTools.generateEnvFile(config));
gulp.task("cleanBuildDir", BuildTools.cleanBuildDir(config));
gulp.task("buildManifest", BuildTools.buildManifest(config));
gulp.task("copyStaticAssets", BuildTools.copyStaticAssets(config));
gulp.task("generateDevMode", BuildTools.generateDevMode(config));
gulp.task("compileCss", CssTools.compileCss(config));
gulp.task("processImages", ImageTools.processImages(config));
gulp.task("buildChangelog", buildChangelog(config));
gulp.task("compilePacks", PackUtils.compilePacks(config));
gulp.task("extractPacksTask", PackUtils.extractPacks(config));
gulp.task("watchStaticAssets", BuildTools.watchStaticAssets(config));
gulp.task("watchImages", ImageTools.watchImages(config));
gulp.task("watchCss", CssTools.watchCss(config));

// All asset building, without cleaning first. Used by `watch` so we don't blow
// away the build dir while Foundry holds open file descriptors to the packs.
const assets = gulp.series(
  "generateEnvFile",
  "buildManifest",
  "buildChangelog",
  "compileCss",
  "processImages",
  "copyStaticAssets",
  "compilePacks",
  "generateDevMode",
);

export const build = gulp.series("cleanBuildDir", assets);

// Build the changelog journal, then compile all packs.
export const generatePacks = gulp.series("buildChangelog", "compilePacks");

// Extract compiled packs back to YAML fragments (also regenerates Babele).
export const extractPacks = gulp.series("extractPacksTask");

// Babele files are regenerated as part of extraction.
export const generateBabele = gulp.series("extractPacksTask");

export const watch = gulp.series(
  assets,
  gulp.parallel("watchStaticAssets", "watchImages", "watchCss"),
);

export default watch;
