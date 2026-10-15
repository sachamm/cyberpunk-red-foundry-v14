# Cyberpunk RED LLM Instructions

This file provides guidance to Agents when working with code in this repository.

## What this is

A [Foundry VTT](https://foundryvtt.com) **game system** implementing the Cyberpunk RED core rules. It runs
inside Foundry's browser client. There is no standalone runtime code only executes inside a live Foundry world.

## Rules

- **Markdown**: after creating or editing any `.md` file (docs, specs, plans, skill `SKILL.md` files
  included), format and lint it before treating it as done — `npx prettier --write <file>` then
  `npx markdownlint --fix <file>`, hand-fixing anything left. See `.claude/skills/markdown/SKILL.md`.
- **gulp/build system**: The gulp-based build system is vendored using `git subtree`; never edit files
  in `gulp/`. See the repos section for details on finding the build-system repository.

## Commit structure

- One logical change per commit; keep each commit small enough to review independently. Do not combine unrelated
  work or retain exploratory fixes and reversals.
- Add regression tests in a separate sibling commit immediately before the behavior change they cover.

## Pre-commit checklist

1. Scope and ownership
   - [ ] `git diff HEAD --name-status` contains only files needed for this change; no local config, temporary files,
         debug artifacts, or unrelated formatting.
   - [ ] No hand edits to vendored code or the CSS bundle and compiled packs under `dist/`; any generated source
         changes are intentional and reviewed.
   - [ ] The change follows the boundaries in [System Architecture](#system-architecture) and reuses existing
         helpers. Any deliberate deviation is explained in the affected file and commit body.
2. Data and user-facing changes
   - [ ] Affected data definitions are updated as described in
         [Data models vs. behaviour](#data-models-vs-behaviour-two-parallel-mixin-systems), with a migration for
         existing-world data when needed.
   - [ ] New user-facing text follows [Localization](#localization).
   - [ ] Changelog entries match the issue's labels and whether the change affects released behavior.
3. Regression evidence
   - [ ] Bug tests exercise the reported reproduction path; feature tests prove the user-visible outcome, using the
         appropriate tier in [Testing](#testing).
   - [ ] If automated coverage is not practical, the MR description explains why and records the manual
         screen/action/result checked, or explicitly states what remains unverified.
4. Validation and final diff
   - [ ] Relevant tests and language-specific formatting/lint checks pass; affected built output has been checked.
   - [ ] The MR's `Steps to Test` describes manual verification; `Additional Notes` records checks actually run and
         any remaining validation gaps.
   - [ ] The staged diff is one focused change, with comments and error messages matching the implemented behavior.

## Repos

All our repos are hosted on gitlab.com, to interact with them use either the GitLab MCP or the glab cli tool,
never attempt to use fetch/webfetch/playwright to interact with GitLab.

- **core/system** - This repo. Gitlab project: `cyberpunk-red-team/fvtt-cyberpunk-red-core`
- **dlc** - The repo we use to distribute official expansions and DLC.
  Gitlab project: `cyberpunk-red-team/fvtt-cyberpunk-red-dlc`
- **build** - The shared git repo used by core/dlc, vendored via `git subtree`. Never edit files in
  `gulp/` directly. Gitlab project: `cyberpunk-red-team/cprc-build`
- **cicd** - The shared cicd system used by core/dlc, no vendored, called using gitlab's remote workflows.
  Gitlab project: `cyberpunk-red-team/cprc-cicd`
- **templates** - The shared issue/mr templates used by the project. Always read these before making a
  Work Item/Issue or Merge Request, selecting the best template for the work. Gitlab project: `cyberpunk-red-team/templates`

### Discovering local repos

As this project is made up of the multiple repos described and the project is worked on by multiple developers
we have a `foundryconfig.json` within this is the key `repos` with a subkey for each repo, if you need to discover
a repo's local checkout location, read the json file and the keys under `repos`, eg: `repos.dlc`.

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
fragment you must stop Foundry to rebuild as founry locks the LevelDB when in use.

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
