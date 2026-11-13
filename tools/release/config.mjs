import path from "node:path";
import Config from "../../gulp/config.mjs";

export const REPOSITORY =
  "https://github.com/sachamm/cyberpunk-red-foundry-v14";

export function releaseVersion(value) {
  if (
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(value ?? "")
  ) {
    throw new Error(
      "Release version must be X.Y.Z with an optional prerelease suffix (without v).",
    );
  }
  return value;
}

// Project-owned GitHub distribution adapter; the shared gulp subtree stays untouched.
export default class GitHubConfig extends Config {
  get foundryConfig() {
    return process.env.CPR_RELEASE_VERSION ? {} : super.foundryConfig;
  }

  get buildDirPath() {
    return process.env.CPR_RELEASE_VERSION
      ? path.join(this.root, "dist", "staging", this.id)
      : super.buildDirPath;
  }

  get version() {
    return process.env.CPR_RELEASE_VERSION
      ? releaseVersion(process.env.CPR_RELEASE_VERSION)
      : super.version;
  }

  get generateManifest() {
    const base = `${REPOSITORY}/releases/download/v${this.version}`;
    return {
      ...this.manifest,
      version: this.version,
      url: REPOSITORY,
      manifest: `${base}/system.json`,
      download: `${base}/${this.id}-${this.version}.zip`,
    };
  }

  get repoUrl() {
    return `${this.generateManifest.url}/releases/download`;
  }

  get manifestUrl() {
    return this.generateManifest.manifest;
  }

  get downloadUrl() {
    return this.generateManifest.download;
  }
}
