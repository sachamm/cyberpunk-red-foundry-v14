# CPRC Build Agent Instructions

This repository contains shared Foundry build tools. Core and DLC import them into `gulp/` using `git subtree`.
Make shared build changes here, not in those imported copies. Keep the generic tasks usable by other Foundry
systems and modules; see [README.md](README.md) for configuration and task interfaces.

## Rules

- Use the GitLab MCP or `glab` CLI for GitLab operations. Read the current issue and merge-request templates from
  [`cyberpunk-red-team/templates`](https://gitlab.com/cyberpunk-red-team/templates) before submitting work.
- Dependencies are installed by the consuming projects; this repository has no `package.json`.

## Repository map

- `config.mjs` defines shared configuration, defaults, and local path discovery.
- `build.mjs`, `css.mjs`, `images.mjs`, and `changelog.mjs` expose Gulp task factories.
- `utils/PackUtils.mjs` owns pack compilation and extraction; `utils/cprPackData.mjs` contains CPR-specific pack
  normalization used by Core and DLC.
- `scripts/` contains GitLab maintenance helpers.

## Pre-commit checklist

- [ ] The diff is one logical change, with no local config, temporary files, or generated build artifacts.
- [ ] Generic tasks contain no new CPR-specific rules; consumer behavior uses the existing configuration hooks.
- [ ] Changed task exports, configuration defaults, dependencies, and output formats are reflected in `README.md`
      and the affected consumer call sites.
- [ ] Regression tests cover the affected task, including failure/cleanup or repeatability where relevant; any
      missing coverage is identified in the MR description.
- [ ] The changed task has been exercised in each affected consumer (Core and DLC when both use it), and its output
      diff has been reviewed. Documentation-only changes need formatting, link, and accuracy checks, not builds.
- [ ] Relevant formatting and lint checks pass using the consuming project's installed tooling and configuration.
- [ ] The MR's `Steps to Test` section describes manual verification; `Additional Notes` records checks run,
      relevant consumer revisions, and anything left unverified.
