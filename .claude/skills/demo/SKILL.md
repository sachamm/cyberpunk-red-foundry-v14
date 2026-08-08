---
name: demo
description: Build the current branch, launch a fresh live Foundry world, open a headed Playwright MCP browser on that world, and drive Foundry to the changed system feature so the dev can see it live.
---

# Demo

Use this skill when the dev wants a live demo of the current branch in Foundry.

The goal is to show the **system change itself** in a visible Foundry session.
Do **not** spend time showing tests or Playwright plumbing.

## Non-negotiable protocol

This skill is a strict execution protocol.

You must follow the phases in order.
You must not skip ahead.
You must not compensate for a failed phase with ad hoc browser actions, custom
scripts, or alternative setup flows.

If any required phase fails, stop immediately and report:

- the phase that failed
- the exact command you ran
- the exact log lines or error text proving the failure

Do not improvise.

## Source of truth

Use these inputs in this order:

1. **Current conversation / task context** - if the dev already told you what
   changed, trust that and go straight there.
2. **Showable changes under `src/` on the branch** - use only as a fallback
   when the conversation is unclear.
3. **Ready-world fallback** - if nothing showable is clear, still launch a
   fresh world and leave it ready for the dev.

## What to ignore for feature inference

These are **not** the thing being demonstrated:

- `tests/**`
- `tools/playwright/**`
- `.mcp.json`
- `shell.nix`
- `package.json` / `package-lock.json`
- docs, schemas, and other tooling-only files

Those files can help you understand **how to drive Playwright**, but they are
not evidence of what feature to show.

## Branch reading

Unless the dev names another ref explicitly, compare the current branch against
`origin/dev`:

```bash
git diff --name-only origin/dev...HEAD
```

Only treat **showable** `src/**` changes as feature hints.

Typical examples:

- `src/modules/item/**`, `src/templates/item/**`, `src/css/**` around item
  sheets -> show an item sheet and the specific tab or section implied by the
  work
- `src/modules/actor/**`, `src/templates/actor/**` -> show an actor sheet
- `src/modules/apps/**`, matching templates or styles -> show that application
- roll or chat behavior under `src/modules/**` -> show the relevant user
  interaction or chat result
- migrations or datamodel changes -> only show them if they result in something
  visible or interactive in Foundry

## World policy

- Default to a **fresh ephemeral** world.
- Do not touch a real saved world unless the dev explicitly asks.
- It is fine to create throwaway demo actors or items in the fresh world.
- Leave Foundry and the browser running by default when you are done.

## Preflight

Before launching:

1. ensure there is not already an active `npm run playwright:serve` process for
   this repo
2. if one exists, stop and report it instead of starting a second one

Do not run multiple serve processes concurrently.
Do not reuse an unknown existing browser session.

## Launch protocol

Phase 1 is the only allowed launch path.

Run exactly this command from the repo root:

```bash
npm run playwright:serve
```

If you need it in the background, run that exact command in the background and
capture its log.

Phase 1 succeeds only when the log contains both lines:

- `Foundry is up at ...`
- `Game URL: ...`

Until both lines appear, the world is **not** considered up.

### Phase 1 failure rule

If any of these happen, stop immediately:

- the command exits before printing both required lines
- the log shows an error before printing both required lines
- the command appears hung and the required lines never appear

If Phase 1 fails, report the failure and do not continue to later phases.

## MCP gate

Phase 2 is attaching the headed Playwright MCP browser.

You may use the Playwright MCP browser **only after Phase 1 succeeds**.

Before Phase 1 succeeds, you must not use the Playwright MCP for:

- setup
- diagnosis
- world creation
- world launch
- login
- clicking through Foundry UI
- inspecting the setup screen for workaround purposes

The headed MCP browser exists only to drive the already-running visible demo
surface after the serve flow has succeeded.

## Forbidden actions

Until `npm run playwright:serve` has printed both required lines, you must not:

- manually create a world in Foundry
- manually launch a world in Foundry
- manually log into Foundry
- use raw Playwright MCP clicks or fills to compensate for serve failure
- run custom Node or Playwright snippets that recreate harness setup behavior
- substitute helper calls such as `launchExistingWorld`, `driveSetup`,
  `joinAsGM`, or similar flows for `npm run playwright:serve`
- use headless browser flows as a replacement for the headed demo path

If the prescribed serve flow fails, stop and report. Do not workaround.

## Browser protocol

After Phase 1 succeeds, connect the Playwright MCP and use its **headed**
browser as the shared live surface.

Use the MCP browser to:

1. open the live Foundry URL
2. join the fresh world as `Gamemaster`
3. dismiss tours or overlays if needed
4. unpause the world if needed
5. drive to the changed feature surface

For the fresh world flow, a blank-password GM join is acceptable. If `/game`
lands on the join screen, join there and continue.

Do not resize the browser window or viewport. Never call Playwright resize or
viewport-setting commands during a demo unless the dev explicitly asks for it.

## Driving policy

Show the **feature surface**, not the scaffolding.

Good examples:

- item-field work -> open a representative item sheet and the relevant tab,
  usually `Settings` when that is where the changed field lives
- actor-sheet work -> open a representative actor sheet
- document browser work -> launch the document browser and exercise the changed
  visible behavior
- roll behavior work -> perform the roll flow that exposes the changed behavior
- settings-menu work -> open the relevant Foundry settings UI

If the current conversation already names the surface, skip inference and go
straight there.

If the feature is unclear but still showable, launch the world and present a
short shortlist of likely surfaces rather than guessing wildly.

If the feature is unclear and not safely inferable, launch the world and leave
it visibly ready for the dev.

## Helper rule

Use the repo's existing Playwright helper modules as your first choice for
understanding setup and repeated interaction patterns.

Read only the helper families you need under:

- `tools/playwright/ui/`
- `tools/playwright/session/`
- `tools/playwright/setup/`

Reuse those established flows before writing any fresh browser-driving logic.

### Helpers are not a substitute for launch

The helper modules are for understanding and repeating established interaction
patterns **after the world is up**.

Allowed use of helpers:

- understand how to navigate the visible UI
- understand how to open the relevant application surface
- understand repeated in-world interaction patterns

Disallowed use of helpers:

- replacing `npm run playwright:serve`
- reproducing world setup manually
- writing custom scripts that reimplement harness launch behavior

Do not grep broadly through tests to rediscover common setup patterns.
Do not treat helper code itself as the feature being demoed.

## Failure handling

There is only one allowed failure behavior:

1. stop
2. report the phase that failed
3. report the exact command used
4. report the exact log evidence
5. wait for further instruction

Do not retry with a different setup method.
Do not diagnose in the browser.
Do not partially continue.
Do not attempt a workaround.

## End state

Finish with:

- the world running
- the headed browser left open
- the changed feature surface visible, or the world clearly ready if no surface
  was safely identifiable
- a short note telling the dev what is currently on screen and any throwaway
  demo documents you created
