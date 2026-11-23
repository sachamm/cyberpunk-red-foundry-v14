# Foundry v14 fork releases

This is an experimental independent fork of Project Red's system. The internal
system ID remains `cyberpunk-red-core` so existing worlds and assets resolve.
It replaces the upstream system installation; keep a separate Foundry data
folder and a backup of any world before testing migrations. Migrated worlds
must not be opened with an older system or Foundry version.

## Build

Use Node 24 and run:

```sh
npm ci
npm run lint
npm run test:unit
npm run package:release -- 0.93.0-v14.alpha.4
```

The release command ignores local Foundry paths and developer migration
settings. It builds only into `dist/staging/cyberpunk-red-core` and writes:

- `dist/release/system.json`: Foundry install manifest.
- `dist/release/cyberpunk-red-core-<version>.zip`: install archive, with
  `system.json` at its root and compiled compendia.
- `dist/release/cyberpunk-red-core-<version>-source.zip`: corresponding source,
  including local uncommitted changes, for GPL distribution.
- `dist/release/SHA256SUMS`: SHA-256 checksums for all three artifacts.

The package includes upstream credits and GPL text. `build-info.json` records
its source commit and whether it contains uncommitted changes. Public builds
should come from a clean tagged checkout. The GitHub packaging workflow builds
and uploads these artifacts on manual dispatch or a `v*-v14.*` tag. It does not
publish a release and does not run licensed Foundry browser tests.

## Validate and publish

1. Run the browser suite against licensed Foundry 14 using the isolated test
   instance. Check combat, netrunning, migrations and the canvas/DV ruler.
2. Build the release archive. Extract it to a separate test data folder's
   `Data/systems/cyberpunk-red-core`, then launch a fresh world with Foundry 14.
3. Test a backed-up real pre-v14 campaign. Historical seeded fixtures cover
   migrations but do not substitute for a genuine old-world export.
4. Commit the reviewed source and tag the exact version as `v<version>`.
5. Build from that clean tag and create a GitHub **prerelease**. Upload all four
   files from `dist/release`. Include compatibility limits and test results.
6. Install from the uploaded `system.json` URL in a fresh isolated Foundry 14
   instance and verify the downloaded package launches.

The manifest uses version-specific GitHub release URLs because GitHub's
`latest` download route does not select prereleases. To move between alpha
versions, install the newer release's manifest URL explicitly. The URLs will
only resolve after their release assets are published.

## Current validation limits

The local test runtime is Foundry 14.370. Tests have covered historical item
fixtures, full migration wizard execution, token state and compendia, active
effects, actor creation, roll cards, combat initiative and turn progression,
Interface and program rolls, rez controls, and the real canvas/DV ruler. A real
pre-v14 campaign export and third-party module combinations remain unverified.

## Automated daily upstream sync

A scheduled Claude task runs this every morning (Pacific time). It follows
upstream **release tags** from
`https://gitlab.com/cyberpunk-red-team/fvtt-cyberpunk-red-core.git`, never its
`dev` branch, so unreleased upstream work stays out of fork releases. It does
nothing on days without a new upstream release.

The fork was built on upstream `dev` during 0.93 development, so it already
contains upstream commits through `3aa484e` that are not yet in any upstream
release. They will be covered once upstream tags 0.93.

1. Fetch upstream tags. Take the highest `v*` tag by version (`v0.93` reads as
   `0.93.0`). Stop if it is not newer than the fork's base version, the part of
   `src/system.json`'s `version` before `-v14` (currently `0.93.0`), or if its
   commit is already in `origin/dev`.
2. On a working branch from `origin/dev`, run `git merge --no-ff <tag>` with
   the message `Merge upstream release <tag>` and a body summarising what the
   release adds. Resolve only conflicts whose correct outcome is clear, keeping
   Foundry v14 compatibility and direct legacy migration support. Never edit
   `gulp/` by hand; take upstream's subtree changes as they are.
3. Run `npm ci`, `npm run lint`, `npm run prettier`, `npm run stylelint`,
   `npm run test:unit` and `npm run package:release -- <version>`. All must
   pass. The licensed Foundry browser suite cannot run in the cloud and is
   recorded as not run.
4. The new version is `<upstream version>-v14.alpha.1`. Add a
   `release: prepare v<version>` commit. Set `version`, `manifest` and
   `download` in `src/system.json` and the example in this file. Move the
   `Unreleased` changelog entries and a summary of the upstream release under
   `## Version <version>`. Write `.github/release-notes/v<version>.md` in the
   shape of earlier release notes: heading `# Foundry v14 Alpha <n>`, changes,
   validation actually run, installation, compatibility and limits, and
   downloads.
5. Open a pull request to `dev`, merge it with a merge commit, and let the
   `Publish v14 prerelease` workflow build, tag and publish the prerelease.
   Check that the workflow passed and the release has all four assets.

The task stops and reports instead of pushing when a conflict is not clearly
resolvable or any check fails. Fork-only fixes between upstream releases are
released by hand with the process above.
