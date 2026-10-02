# Cyberpunk RED LLM Instructions

This file provides guidance to Agents when working with code in this repository.

## What this is

A [Foundry VTT](https://foundryvtt.com) **game system** implementing the Cyberpunk RED core rules. It runs
inside Foundry's browser client; there is no standalone runtime.

## Rules

- **Markdown**: after creating or editing any `.md` file (docs, specs, plans, skill `SKILL.md` files
  included), format and lint it before treating it as done — `npx prettier --write <file>` then
  `npx markdownlint --fix <file>`, hand-fixing anything left. See `.claude/skills/markdown/SKILL.md`.
- **gulp/build system**: The gulp-based build system is vendored using `git subtree`; never edit files
  in `gulp/`. See the repos section for details on finding the build-system repository.

## Project change checklist

Before marking a change ready for review:

- Change the owning source: runtime code under `src/`, compendium content under `src/packs/`, and shared build code
  in `cprc-build` rather than the vendored `gulp/` copy.
- Follow the existing data-model, document, sheet, hook, and localization patterns. If an issue suggests a different
  implementation, explain why the merge request follows the repository's established architecture instead.
- Add coverage at the appropriate tier described below. Bug coverage should exercise the reported path and, where
  practical, demonstrate the failure without the fix. If meaningful automation is not practical, identify the
  remaining manual check in the merge request.
- Run the checks relevant to the changed files: `npm run lint`, `npm run prettier`, and `npm run test:unit` for
  JavaScript; `npm run test:playwright` for live Foundry behavior; `npm run stylelint` for CSS; and `npm run build`
  for changes affecting packs, templates, styles, images, or other built output. Do not report checks that were not
  run.
- Keep persisted data changes synchronized across the DataModel, `template.json`, generated schemas, migrations,
  and pack YAML as applicable. Review generated changes rather than accepting them blindly.
- Add user-facing text to `src/lang/en.json`, and update `CHANGELOG.md` when the issue labels and release visibility
  require it.
- Inspect the final diff for unrelated edits, debugging artifacts, stale comments, and unintended generated files.
  Use the current merge-request template and list the exact validation performed and anything left unverified.

## Repos

All our repos are hosted on GitLab.com. To interact with them, use either the GitLab MCP or the `glab` CLI tool;
never attempt to use fetch/webfetch/playwright to interact with GitLab.

- **core/system** - This repo. Gitlab project: `cyberpunk-red-team/fvtt-cyberpunk-red-core`
- **dlc** - The repo we use to distribute official expansions and DLC.
  Gitlab project: `cyberpunk-red-team/fvtt-cyberpunk-red-dlc`
- **build** - The shared git repo used by core/dlc, vendored via `git subtree`. Never edit files in
  `gulp/` directly. Gitlab project: `cyberpunk-red-team/cprc-build`
- **cicd** - The shared CI/CD system used by core/dlc, not vendored, called using GitLab's remote workflows.
  Gitlab project: `cyberpunk-red-team/cprc-cicd`
- **templates** - The shared issue/mr templates used by the project. Always read these before making a
  Work Item/Issue or Merge Request, selecting the best template for the work. Gitlab project: `cyberpunk-red-team/templates`

### Discovering local repos

Because this project is made up of multiple repositories and is worked on by multiple developers, local checkout
locations are stored in `foundryconfig.json`. Read the keys under `repos`, such as `repos.dlc`, instead of assuming
that repositories are adjacent.

## System Architecture

### Entry point and registration

`src/cpr.js` is the ESM entry (declared in `src/system.json` `esmodules`, **not** `package.json`). On Foundry's
`init` hook it registers everything: actor/item sheet classes, document subclasses (`CONFIG.Actor/Item/
ChatMessage/Combat/Combatant/ActiveEffect.documentClass`), all data models, settings, Handlebars helpers, and
API. `src/modules/system/hooks.js` dynamically imports every file under `src/modules/hooks/` via a computed
`import()` — that's why `.fallowrc.json` marks that dir as `dynamicallyLoaded` (static analysis can't see it).

### Documents are proxied by type

`entity-factory.js` returns a JS `Proxy` over Foundry's base `Actor`/`Item` that intercepts `construct` and
routes to the right subclass based on `data.type` (character/mook/vehicle/… for actors;
weapon/armor/skill/cyberware/… for items). So `new Actor({type:"character"})` yields a `CPRCharacterActor`.

### Data models vs. behaviour (two parallel mixin systems)

- **Schemas** live in `src/modules/datamodels/`. Each Actor/Item type has a DataModel extending
  `CPRSystemDataModel` (`system-data-model.js`), which composes reusable schema fragments via a **mixin**
  mechanism (`SystemDataModel.mixin(...)`) — e.g. an item schema mixes in `physical`, `equippable`,
  `valuable`, `stackable`, `attackable` from `datamodels/item/mixins/`. This mirrors Foundry's old
  `template.json` templates but as composable classes. `template.json` still exists and must stay in sync.
- **Behaviour** lives in `src/modules/item/` and `src/modules/actor/`. `CPRItem` (base document) composes
  method mixins from `item/mixins/` (`cpr-attackable.js`, `cpr-loadable.js`, `cpr-container.js`, …), and
  per-type logic lives in `item/types/cpr-*.js`. Actors follow the same split (`actor/cpr-*.js` + sheets).

Adding a field to an item type usually means editing its datamodel mixin/schema **and** `template.json`, plus
possibly a migration script and the type's `.js` behaviour.

### Migrations (`src/modules/system/migrate/`)

Numbered scripts in `migrate/scripts/` (e.g. `042-add-damage-crit-config.js`) registered in `scripts/index.js`,
run by `MigrationRunner`. Any change to persisted actor/item data shape needs a new numbered migration.
`foundryconfig.json`'s `devMode.migrations` block controls dev-time re-migration behaviour.

### Compendium packs (`src/packs/`)

Source of truth is **per-entry YAML** (`src/packs/{core,other,internal}/…/*.yaml`). `npx gulp build` compiles
them into LevelDB packs in `dist/`; `npm run extractPacks` goes the other way (compiled → YAML) and also
regenerates Babele translation mappings. Edit the YAML, never the compiled packs. If you make changes to a YAML
fragment you must stop Foundry before rebuilding because Foundry locks the LevelDB while it is in use.

### Localization

Every user-facing string is a localization key resolved via `SystemUtils.Localize("CPR.…")`, defined in
`src/lang/en.json` (~1300 keys; other locales via Babele/Crowdin). New UI strings must be added to `en.json`,
never to other languages, these are translated by humans on Crowdin.

## Testing

Two tiers, deliberately separated (see `vitest.config.js` header):

- **Unit (`tests/unit/`, Vitest)** — only Foundry-free logic or units touching a thin, stubbed slice of the
  Foundry surface (stubs in `tests/unit/setup.js`). Fast, CLI. Config invariants, pure string/number helpers,
  formula sanitization.
- **Browser (`tests/playwright/`, Playwright)** — anything that genuinely needs a running Foundry: document/
  sheet/data-model behaviour, real rolls, migrations, drag-drop. `npm run test:playwright` builds the system,
  boots Foundry against an **isolated** project-local data dir (`.playwright/foundry-data`, never your real
  `dataPath`), creates an ephemeral world, runs specs, and tears down. Harness lives in `tools/playwright/`.
  Normal specs must create/delete Actors and Items through explicit UI helpers in `tools/playwright/ui/`, not
  direct `Actor.create`, `Item.create`, embedded-document lifecycle, or bulk delete APIs. Direct API use remains
  allowed for users, permissions, settings, modules, deterministic roll setup, and read-only assertions.

For manual live checks, `npm run playwright:serve` + the Playwright MCP.

## Environment notes

- **NixOS / Playwright**: browsers come from `shell.nix`, never `npx playwright install`. If Playwright/
  Chromium can't launch or revisions mismatch, fix `shell.nix` — see `.claude/skills/playwright/nix/SKILL.md`.
