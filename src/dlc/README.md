# Bundled Cyberpunk RED DLC

This directory bundles the content of the community
[Cyberpunk RED - DLC](https://gitlab.com/cyberpunk-red-team/fvtt-cyberpunk-red-dlc) module into this
Foundry v14 fork of the system, because the module has no Foundry v14 release yet. It is kept apart from
the core system so it can be removed in one step once the official module supports v14.

The import commit is recorded in [`SOURCE.json`](SOURCE.json).

## What is here

- `packs/` – the module's compendium YAML (Black Chrome, DLC, Elflines Online)
- `icons/`, `assets/` – the module's images, served from `systems/cyberpunk-red-core/dlc/`
- `babele/` – the module's translations, copied into the system's `babele/<lang>/` at build time
- `dlc.json` – the DLC packs and compendium folders, merged into `system.json` at build time
- `LICENCE.md`, `CREDITS.md` – the module's licence, credits and the R. Talsorian Games Homebrew
  Content Policy notice; these ship with the content and must stay with it

Paths in `CREDITS.md` such as `src/icons/…` refer to the upstream repository layout; here they live under
`src/dlc/icons/…`.

The only changes from upstream are that `modules/cyberpunk-red-dlc/…` paths and
`Compendium.cyberpunk-red-dlc.…` links now point inside this system, and Babele files are renamed to the
system's pack collection ids. Pack names are unchanged. A short list of broken links and image paths in the upstream data is corrected
on import (`UPSTREAM_FIXES` in `tools/dlc/import.mjs`). Compendium folder entries upstream lists without
a matching pack (`black-chrome_programs`, `black-chrome_rolltables`) are dropped.

## Build

`npx gulp build` includes the DLC automatically. `tools/dlc/dlc.mjs` merges `dlc.json` into the built
manifest and its `bundleDlc` task places the translations and licence files. `src/system.json` is not
edited. Build without the DLC with `CPR_SKIP_DLC=1 npx gulp build`.

## Re-sync from upstream

```sh
npm run dlc:import -- /path/to/fvtt-cyberpunk-red-dlc
```

Without a path, `repos.dlc` from `foundryconfig.json` is used. The script replaces this directory
(except this README) with the upstream checkout's content.

## Remove

When the official module supports Foundry v14:

1. Delete `src/dlc/`, `tools/dlc/` and `tests/unit/dlc-bundle.test.js`.
2. In `gulpfile.mjs`, remove the `tools/dlc/dlc.mjs` import, the `withDlc(...)` wrapper (use
   `GitHubConfig` directly as `Config`) and the `bundleDlc` task.
3. Remove the `dlc:import` script from `package.json` and `tools/dlc` from its `lint` script.

Items already dragged into a world are copies and keep working, but their images and links point at
`systems/cyberpunk-red-core/dlc/…`. Re-import them from the official module's compendia to repoint them.
