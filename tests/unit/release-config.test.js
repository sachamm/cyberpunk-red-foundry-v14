import { afterEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import GitHubConfig, { releaseVersion } from "../../tools/release/config.mjs";

afterEach(() => vi.unstubAllEnvs());

describe("GitHub release isolation", () => {
  it("ignores local deployment paths and developer overrides in a release build", () => {
    vi.stubEnv("CPR_RELEASE_VERSION", "0.93.0-v14.alpha.1");
    vi.stubEnv("FOUNDRY_DATA_PATH", "/a/personal/campaign");
    const config = new GitHubConfig({ manifestFile: "src/system.json" });
    expect(config.buildDirPath).toBe(
      path.join(process.cwd(), "dist/staging/cyberpunk-red-core"),
    );
    expect(config.foundryConfig).toEqual({});
    expect(config.generateManifest).toMatchObject({
      id: "cyberpunk-red-core",
      version: "0.93.0-v14.alpha.1",
      compatibility: { minimum: 14, maximum: 14, verified: 14 },
      manifest:
        "https://github.com/sachamm/cyberpunk-red-foundry-v14/releases/download/v0.93.0-v14.alpha.1/system.json",
      download:
        "https://github.com/sachamm/cyberpunk-red-foundry-v14/releases/download/v0.93.0-v14.alpha.1/cyberpunk-red-core-0.93.0-v14.alpha.1.zip",
    });
  });

  it.each(["DUMMY_VALUE", "v0.93.0", "../escape", "0.93", "0.93.0; echo nope"])(
    "rejects unsafe release version %s",
    (value) => {
      expect(() => releaseVersion(value)).toThrow();
    },
  );
});
