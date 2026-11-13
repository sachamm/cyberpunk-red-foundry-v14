# Migration Playwright Specs

Specs in this directory intentionally exercise migration seams that require historical or pre-cleaned document data. They may seed persisted Actors or Items with Foundry document APIs so migrations can be verified against data shapes that no longer have a normal UI creation path.

Keep this exception local to migration coverage. Normal Playwright specs should create Actors and Items through the UI helpers in `tools/playwright/ui/` and reserve direct APIs for users, permissions, settings, modules, and read-only assertions.

## Historical world coverage

`legacy-world.spec.mjs` seeds a disposable world at data-model version 38, runs the full migration wizard, and reloads before checking world items, embedded items, linked and unlinked tokens, and a world compendium. It also verifies that a rejected write leaves the world version unchanged.

`fixtures/v0.92.4-items.json` contains the Heavy Pistol, Agent, and Agent effect from upstream tag `v0.92.4` (`src/packs/core/weapons/weapon.heavy.pistol.yaml`, `src/packs/core/gear/gear.agent.yaml`, and `src/packs/core/gear/effect.agent.OnONUXyMY8mOquf7.yaml`). Pack-only `_key` metadata was removed and the effect was embedded in its item. These are historical source fixtures loaded into v14, not a world exported by a running older Foundry server; testing an actual campaign export remains a separate check.
