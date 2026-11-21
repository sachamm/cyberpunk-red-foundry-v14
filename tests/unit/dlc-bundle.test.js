import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import GitHubConfig from "../../tools/release/config.mjs";
import { withDlc } from "../../tools/dlc/dlc.mjs";

afterEach(() => vi.unstubAllEnvs());

const DlcConfig = withDlc(GitHubConfig);
const coreManifest = JSON.parse(fs.readFileSync("src/system.json", "utf8"));
const dlc = JSON.parse(fs.readFileSync("src/dlc/dlc.json", "utf8"));

const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );

describe("bundled DLC", () => {
  it("adds every DLC pack and folder to the built manifest", () => {
    const manifest = new DlcConfig({ manifestFile: "src/system.json" })
      .manifest;
    expect(manifest.packs).toEqual([...coreManifest.packs, ...dlc.packs]);
    expect(manifest.packFolders).toEqual([
      ...coreManifest.packFolders,
      ...dlc.packFolders,
    ]);
    expect(dlc.packs).toHaveLength(27);
  });

  it("builds the system without DLC when CPR_SKIP_DLC is set", () => {
    vi.stubEnv("CPR_SKIP_DLC", "1");
    const config = new DlcConfig({ manifestFile: "src/system.json" });
    expect(config.manifest.packs).toEqual(coreManifest.packs);
  });

  it("keeps DLC packs out of core babele generation and generic copies", () => {
    const config = new DlcConfig({
      manifestFile: "src/system.json",
      excludeDirs: ["packs"],
      packs: { excludePacks: ["other_macros"] },
    });
    expect(config.packs.excludePacks).toEqual([
      "other_macros",
      ...dlc.packs.map((p) => p.name),
    ]);
    expect(config.excludeDirs).toEqual([
      "packs",
      path.join("dlc", "packs"),
      path.join("dlc", "babele"),
    ]);
  });

  it("declares DLC packs that exist, live under src/dlc and do not clash with core", () => {
    const coreNames = new Set(coreManifest.packs.map((p) => p.name));
    const dlcNames = new Set(dlc.packs.map((p) => p.name));
    for (const pack of dlc.packs) {
      expect(pack.path.startsWith("dlc/packs/")).toBe(true);
      expect(fs.existsSync(path.join("src", pack.path))).toBe(true);
      expect(coreNames.has(pack.name)).toBe(false);
      expect(pack.system).toBe("cyberpunk-red-core");
    }
    for (const folder of dlc.packFolders) {
      for (const name of folder.packs) expect(dlcNames.has(name)).toBe(true);
    }
  });

  it("no longer refers to the standalone DLC module", () => {
    const leftovers = walk("src/dlc")
      .filter((f) => /\.(ya?ml|json)$/.test(f))
      .filter((f) =>
        /modules\/cyberpunk-red-dlc\/|Compendium\.cyberpunk-red-dlc\./.test(
          fs.readFileSync(f, "utf8"),
        ),
      );
    expect(leftovers).toEqual([]);
    expect(
      fs
        .readdirSync("src/dlc/babele/en")
        .every((f) => f.startsWith("cyberpunk-red-core.")),
    ).toBe(true);
  });

  it("ships the DLC licence and credits with the content", () => {
    for (const doc of ["LICENCE.md", "CREDITS.md", "README.md"]) {
      expect(fs.existsSync(path.join("src/dlc", doc))).toBe(true);
    }
    expect(fs.readFileSync("src/dlc/CREDITS.md", "utf8")).toMatch(
      /Homebrew Content Policy of R\. Talsorian Games/,
    );
  });
});
