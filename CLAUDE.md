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

## Engineering workflow

Use this lifecycle for substantive changes. Routine, obvious edits do not need planning ceremony, but they still
need appropriate verification and a final diff review.

1. **Establish the contract**: Treat an issue as the desired outcome and acceptance criteria, not an infallible
   implementation specification. Confirm the exact user-visible behavior, reproduction path, and boundaries.
2. **Investigate before editing**: Find the components that own the behavior, their call and data paths, existing
   abstractions, analogous implementations, tests, fixtures, schemas, configuration, and recent related changes.
   Consult authoritative Foundry or dependency source when external behavior matters.
3. **Challenge the approach**: Ask what facts could make the proposed solution wrong. Check the relevant Foundry
   versions, persisted-data and migration concerns, lifecycle ordering, public APIs, and module consumers. Follow
   repository evidence over an issue's suggested implementation, and explain material deviations.
4. **Plan when needed**: For a nontrivial change, record a concise approach, affected components, important
   assumptions, compatibility concerns, and verification strategy before editing.
5. **Integrate, do not patch around**: Prefer established extension points and shared abstractions. Avoid duplicate
   mechanisms, unnecessary monkey-patching, brittle implementation coupling, and fixes that only cover the
   demonstrated example.
6. **Verify mechanically**: Run the smallest sufficient combination of unit, browser, build, lint, formatting,
   schema, migration, and targeted reproduction checks. Add regression coverage where practical, and never claim
   a check that was not run.
7. **Review and repair**: After verification, review the final diff as if it were someone else's merge request.
   Look for incorrect assumptions, incomplete coverage, compatibility and lifecycle problems, weak error handling,
   unnecessary complexity, accidental scope, stale documentation, and tests that prove only the happy path. Fix
   real problems found and rerun the affected checks.
8. **Report evidence**: Leave the repository reviewable and state what changed, why the approach fits the
   architecture, what was verified, and what remains uncertain or requires human judgment. Distinguish facts
   established by code, tests, or authoritative documentation from inference.

Fix related problems only when they are necessary for the requested behavior to be correct. Track important
unrelated findings separately rather than silently expanding the change.

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
