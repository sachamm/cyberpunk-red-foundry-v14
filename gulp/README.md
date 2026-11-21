# Cyberpunk RED - Build System

This repo contains the build system used by the CPRC projects.

While this has been built for the CPRC projects it should be usable by other
Foundry Modules/Systems.

## Overview

This repo is designed to be used as a
[Git Subtree](https://www.w3docs.com/learn-git/git-subtree.html)
(importantly, not a git submodule!)

## Usage

### Managing the sub module

#### Add the repo as a git remote

`git remote add --fetch cprc-build git@gitlab.com:cyberpunk-red-team/cprc-build.git`

#### Pull in the files as a submodule

`git subtree add --prefix .gulp cprc-build main --squash`

This will add this repo in the `.gulp/` directory of the repo and squash all
commits from the `cprc-build` repo as a single commit.

#### Pull changes from sub module

`git subtree pull --prefix .gulp cprc-build main --squash`

This will pull in the latest changes from `main` in `cprc-build` into `.gulp/`
and squash all commits into a single commit.

### Adding your project's `gulpfile.mjs`

To use the build system you'll need to add a `gulpfile.mjs` to the root of your
project.

This should look something like:

```js
import gulp from "gulp";
import * as BuildTools from "./gulp/build.mjs";
import * as ImageTools from "./gulp/images.mjs";
import { PackUtils } from "./gulp/utils/PackUtils.mjs";
import Config from "./gulp/config.mjs";

// Configure the build system for your module
const config = new Config({
  manifestFile: "src/module.json",
  staticExts: [".json", ".hbs", ".css", ".js"],
  excludeDirs: ["packs"], // Optional: directories to exclude
});

// Import the tasks needed for your module
gulp.task("generateEnvFile", BuildTools.generateEnvFile(config));
gulp.task("cleanBuildDir", BuildTools.cleanBuildDir(config));
gulp.task("buildManifest", BuildTools.buildManifest(config));
gulp.task("copyStaticAssets", BuildTools.copyStaticAssets(config));
gulp.task("extractPacks", PackUtils.extractPacks(config));
gulp.task("compilePacks", PackUtils.compilePacks(config));
gulp.task("processImages", ImageTools.processImages(config));
gulp.task("watchImages", ImageTools.watchImages(config));
gulp.task("watchStaticAssets", BuildTools.watchStaticAssets(config));

// Run these tasks when running `npx gulp build`
export const build = gulp.series(
  "generateEnvFile",
  "cleanBuildDir",
  "buildManifest",
  "processImages",
  "copyStaticAssets",
  "compilePacks",
);

// Run these tasks when running `npx gulp watch`
export const watch = gulp.parallel("watchImages", "watchStaticAssets");
```

### `foundryconfig.json`

For local development, create a `foundryconfig.json` in your project root to
automatically build directly into your Foundry VTT data directory:

> ⚠️ Do not commit this file to git, this is for local use only.

```json
{
  "foundry": {
    "dataPath": "/path/to/FoundryVTT/{VERSION}",
    "versionPrefix": "V"
  }
}
```

When `foundry.dataPath` is set, the build output goes to
`{dataPath}/Data/modules/{id}` (or `systems/` for `system.json` manifests)
instead of the configured `buildDir`.

`{VERSION}` may appear anywhere in the path string and every occurrence is
replaced using the configured manifest's `compatibility.verified` value.
`foundry.versionPrefix` is optional: when set, it replaces a leading `v`/`V`
in that compatibility version, or is prepended when the version has no leading
`v`/`V`. When omitted, lowercase `v` is used by default.

Legacy top-level `dataPath` and `versionPrefix` keys are still accepted for
backwards compatibility, but the nested `foundry.*` keys are preferred. If
both are present, `foundry.dataPath` and `foundry.versionPrefix` take
precedence.

> ℹ️ `FOUNDRY_DATA_PATH` remains the highest-priority override. If it contains
> `{VERSION}`, the same interpolation and `versionPrefix` rules apply.
>
> ⚠️ Top-level `dataPath` and `versionPrefix` are deprecated. Move them under
> `foundry` when you next update your local config.
>
> ℹ️ If you're using Windows you must use `/` as a dir seperator, not `\`
> eg: `C:/Path/to/Foundry`

### Configuration Options

The `Config` constructor accepts the following options.

<!-- markdownlint-disable MD013 -->

| Option           | Default                                                                                                             | Description                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `manifestFile`   | `"src/module.json"`                                                                                                 | Path to module/system manifest file                                             |
| `srcDir`         | `"src"`                                                                                                             | Source directory of your module's files                                         |
| `buildDir`       | `"dist"`                                                                                                            | Build output directory (can be overridden by `foundryconfig.json`)              |
| `staticExts`     | `[".json", ".hbs", ".css", ".js"]`                                                                                  | File extensions to copy to build                                                |
| `imageExts`      | `[".svg", ".png", ".webp"]`                                                                                         | Image extensions to process                                                     |
| `excludeDirs`    | `[]`                                                                                                                | Directories to exclude (applies to both static assets and images)               |
| `defaultVersion` | `"v0.0.0dev"`                                                                                                       | Fallback version when CI/manifest unavailable                                   |
| `foundryConfig`  | `"foundryconfig.json"`                                                                                              | Path to Foundry config (for local dev `foundry.dataPath` override)              |
| `changelogFile`  | `"CHANGELOG.md"`                                                                                                    | Path to changelog                                                               |
| `creditsFile`    | `"CREDITS.md"`                                                                                                      | Path to credits                                                                 |
| `varsFile`       | `"vars.env"`                                                                                                        | Output path for CI environment file                                             |
| `babele`         | `{ enabled: false, dir: "babele" }`                                                                                 | Babele translation file generation options                                      |
| `css`            | `{ enabled: false, entry: "css/main.css", out: "css/main.css" }`                                                    | PostCSS pipeline options (entry/out relative to srcDir/buildDir)                |
| `changelog`      | `{ enabled: false, packName: "changelog" }`                                                                         | Changelog journal generation options (`packName` = manifest pack to write into) |
| `credits`        | `{ enabled: false, packName: "credits" }`                                                                           | Credits journal generation options (`packName` = manifest pack to write into)   |
| `devMode`        | `{ enabled: false, outPath: "modules/system/devMode.js", defaults: {} }`                                            | DevMode module generation (`defaults` merged under foundryconfig's `devMode`)   |
| `packs`          | `{ transformEntry: null, transformName: null, excludePacks: [], stats: false, lastModifiedBy: "0000000000000000" }` | Pack extract/compile hooks, Babele exclusions, and `_stats` stamping            |

> ℹ️ Hidden directories (starting with `.`) and `node_modules` are always
> excluded from file searches and watchers, regardless of `excludeDirs` settings.

<!-- markdownlint-enable MD013 -->

These options are also available but are not strictly requires as they are
filled in automatically when the build system is running within Gitlab CI
when building a new release.

#### GitLab Specific Options

<!-- markdownlint-disable MD013 -->

| Option              | Default                       | Description                    |
| ------------------- | ----------------------------- | ------------------------------ |
| `gitlabHost`        | CI env var or `"example.com"` | GitLab host for URL generation |
| `gitlabProjectId`   | CI env var or `"0123456789"`  | GitLab project ID              |
| `gitlabProjectName` | CI env var or `"project"`     | GitLab project name            |
| `gitlabGroupName`   | CI env var or `"group"`       | GitLab group name              |

<!-- markdownlint-enable MD013 -->

> ℹ️ We have separate tasks for handling images. You should use those tasks for
> handling images rather than `staticExts`/`excludeDirs`.

#### Version Priority

Version is determined in the following order:

1. `CI_COMMIT_TAG` environment variable (for CI builds from a git tag)
2. Date-based version `vYYYYMMDD.HHmm` (for CI builds without tags)
3. `version` field from manifest file
4. `defaultVersion` configuration option

### Available Tasks

#### Build Tasks (`build.mjs`)

<!-- markdownlint-disable MD013 -->

| Task                       | Description                                             |
| -------------------------- | ------------------------------------------------------- |
| `cleanBuildDir(config)`    | Removes all contents from build directory               |
| `copyStaticAssets(config)` | Copies files matching `staticExts` to build             |
| `buildManifest(config)`    | Generates manifest with version and GitLab URLs         |
| `generateEnvFile(config)`  | Creates vars.env with module metadata for CI/CD scripts |

#### Watch Tasks (`build.mjs`)

| Task                        | Description                |
| --------------------------- | -------------------------- |
| `watchStaticAssets(config)` | Watches assets for changes |

<!-- markdownlint-enable MD013 -->

#### Image Tasks (`images.mjs`)

1. SVGs are optimized with [SVGO](https://github.com/svg/svgo)
   - This allows SVGs to be saved with all their data useful for design/dev but
     optimized for distribution.
2. Set width/height to 512x512 if not specified in the SVG file already.
   - This is to deal with a Firefox/pixijs
     [bug](https://github.com/pixijs/pixijs/issues/7877) which prevents Scenes in
     Foundry loading if they have an SVG in use as a token etc. image.
3. If it's a raster images (jpg, png, etc.) it just copies the image

<!-- markdownlint-disable MD013 -->

| Task                    | Description          |
| ----------------------- | -------------------- |
| `processImages(config)` | Processes all images |

<!-- markdownlint-enable MD013 -->

#### Watch Tasks (`images.mjs`)

<!-- markdownlint-disable MD013 -->

| Task                  | Description                |
| --------------------- | -------------------------- |
| `watchImages(config)` | Watches images for changes |

<!-- markdownlint-enable MD013 -->

#### CSS Tasks (`css.mjs`)

Disabled by default. Enable with the `css` option to compile a single entry
stylesheet through PostCSS (`postcss-import` → `postcss-mixins` →
`postcss-nested` → `autoprefixer`) into one bundled file. Compilation errors are
fatal in CI and non-fatal locally so the watcher survives a bad edit.

> ℹ️ When `css.enabled`, remove `.css` from `staticExts` (or `excludeDirs` the
> CSS source folder) so `copyStaticAssets` doesn't also copy the raw,
> uncompiled CSS.

Consumer dependencies to add: `postcss`, `postcss-import`, `postcss-mixins`,
`postcss-nested`, `autoprefixer`.

<!-- markdownlint-disable MD013 -->

| Task                 | Description                                       |
| -------------------- | ------------------------------------------------- |
| `compileCss(config)` | Compiles the CSS entry into a single bundled file |

<!-- markdownlint-enable MD013 -->

##### Watch Tasks (`css.mjs`)

<!-- markdownlint-disable MD013 -->

| Task               | Description                                        |
| ------------------ | -------------------------------------------------- |
| `watchCss(config)` | Recompiles the bundle on any CSS add/change/delete |

<!-- markdownlint-enable MD013 -->

#### Changelog Tasks (`changelog.mjs`)

Disabled by default. Enable with the `changelog` option to turn the project's
`CHANGELOG.md` (and per-language `CHANGELOG.<lang>.md`) into Foundry journal pack
fragments — one journal per manifest language, one page per released version —
written into the source directory of the manifest pack named by
`changelog.packName`. Run it before `compilePacks` so the journal is built into
the pack:

```js
export const generatePacks = gulp.series("buildChangelog", "compilePacks");
```

Languages come from the manifest's `languages` array (falling back to English
only). A version heading must match `Version: X.Y.Z`. Consumer dependencies to
add: `marked`, `js-yaml`.

<!-- markdownlint-disable MD013 -->

| Task                     | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `buildChangelog(config)` | Writes changelog journal fragments into the pack src |

<!-- markdownlint-enable MD013 -->

#### Credits Tasks (`credits.mjs`)

Disabled by default. Enable with the `credits` option to turn the project's
`CREDITS.md` into a Foundry journal pack fragment — one page per `#` / `##`
section heading — written into the source directory of the manifest pack named
by `credits.packName`. Run it before `compilePacks` so the journal is built into
the pack:

```js
export const generatePacks = gulp.series("buildCredits", "compilePacks");
```

Consumer dependencies to add: `marked`, `js-yaml`.

<!-- markdownlint-disable MD013 -->

| Task                   | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `buildCredits(config)` | Writes credits journal fragment into the pack src |

<!-- markdownlint-enable MD013 -->

#### DevMode Task (`build.mjs`)

Disabled by default. Enable with the `devMode` option to write an ES module that
default-exports your `devMode` defaults deep-merged with the `devMode` key of a
local `foundryconfig.json` (for per-developer overrides). Keep your project's
defaults in `devMode.defaults` so this task stays project-agnostic.

<!-- markdownlint-disable MD013 -->

| Task                      | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `generateDevMode(config)` | Writes the merged devMode module to the build output |

<!-- markdownlint-enable MD013 -->

#### Pack Tasks (`PackUtils.mjs`)

<!-- markdownlint-disable MD013 -->

| Task                             | Description                                                                 |
| -------------------------------- | --------------------------------------------------------------------------- |
| `PackUtils.compilePacks(config)` | Compiles YAML fragments back to binary packs                                |
| `PackUtils.extractPacks(config)` | Extracts compiled packs to YAML fragments and generates Babele translations |

<!-- markdownlint-enable MD013 -->

Pack processing is customizable through the `packs` option:

- `transformName(entry)` — override the fragment filename on extract.
- `transformEntry(entry)` — clean/transform each entry; runs on extract (so the
  committed YAML is normalized) and on compile (returning `false` discards it).
- `stats: true` + `lastModifiedBy` — stamp a `_stats` block on each entry during
  compile.
- `excludePacks` — pack names to skip when generating Babele files.
- `generatedPacks` — pack names produced by other build tasks (e.g. the changelog
  journal); skipped entirely on extract so generated content is never round-tripped.
- `babeleMappings` — extra translatable item fields to extract, as
  `{ field: "dot.path" }` (e.g. `{ dvTable: "system.dvTable" }`). RollTable packs
  automatically emit their results.

A ready-made CPR cleaner is shipped in `utils/cprPackData.mjs`; wire it in with
`packs: { transformEntry: cprTransformEntry, stats: true }`.

> ℹ️ A pack's `path` is the single source of truth for its location: YAML source
> lives at `<srcDir>/<pack.path>` and the compiled pack at `<buildDir>/<pack.path>`.
> Group packs in subdirectories (e.g. `{ "name": "core_weapons", "path":
"packs/core/weapons" }`) and the source/compiled trees stay in lockstep — the
> pack `name` is only used as the compendium id and Babele filename.
