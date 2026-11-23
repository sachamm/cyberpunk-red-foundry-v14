import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import GitHubConfig from "../../tools/release/config.mjs";
import { readDlcManifest, withDlc } from "../../tools/dlc/dlc.mjs";

afterEach(() => vi.unstubAllEnvs());

const DlcConfig = withDlc(GitHubConfig);
const coreManifest = JSON.parse(fs.readFileSync("src/system.json", "utf8"));
const dlc = readDlcManifest(path.resolve("src"));

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
    // 27 module packs plus the v12-only Hardened Enemies tables.
    expect(dlc.packs).toHaveLength(28);
  });

  it("restores the v12 Hardened Enemies tables under their v12 pack name", () => {
    const pack = dlc.packs.find((p) => p.name === "dlc_hardened-enemies");
    expect(pack).toMatchObject({
      type: "RollTable",
      path: "dlc/legacy/packs/hardened-enemies",
    });
    expect(
      dlc.packFolders.filter((f) => f.packs.includes(pack.name)),
    ).toMatchObject([{ name: "Cyberpunk RED: DLC" }]);
    const tables = fs.readdirSync(path.join("src", pack.path));
    expect(tables.sort()).toEqual([
      "table.hardened_lieutenant_tactics.yaml",
      "table.hardened_mini_boss_mini_promotion.yaml",
      "table.mook_encounter_complication.yaml",
    ]);
    for (const file of tables) {
      const text = fs.readFileSync(path.join("src", pack.path, file), "utf8");
      expect(text).not.toMatch(/^\s+text:/m);
      expect(text).toMatch(/^\s+description: \S/m);
    }
  });

  it("builds the system without DLC when CPR_SKIP_DLC is set", () => {
    vi.stubEnv("CPR_SKIP_DLC", "1");
    const config = new DlcConfig({ manifestFile: "src/system.json" });
    expect(config.manifest.packs).toEqual(coreManifest.packs);
    // Nothing under src/dlc/ (art, data) may be copied either.
    expect(config.excludeDirs).toContain("dlc");
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
      expect(pack.path).toMatch(/^dlc\/(legacy\/)?packs\//);
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

  it("resolves every compendium link and image in the DLC content", () => {
    const docIds = new Map();
    for (const pack of [...coreManifest.packs, ...dlc.packs]) {
      const dir = path.join("src", pack.path);
      if (!fs.existsSync(dir)) continue; // generated packs (changelog)
      const ids = new Set();
      for (const file of walk(dir).filter((f) => f.endsWith(".yaml"))) {
        const match = fs.readFileSync(file, "utf8").match(/^_id: (\S+)$/m);
        if (match) ids.add(match[1]);
      }
      docIds.set(pack.name, ids);
    }

    const broken = [];
    for (const file of walk("src/dlc/packs")) {
      const text = fs.readFileSync(file, "utf8");
      for (const [ref, pack, id] of text.matchAll(
        /Compendium\.cyberpunk-red-core\.([\w-]+)\.(?:[A-Za-z]+\.)?([A-Za-z0-9]{16})/g,
      )) {
        if (!docIds.get(pack)?.has(id)) broken.push(`${file}: ${ref}`);
      }
      for (const [, rel] of text.matchAll(
        /systems\/cyberpunk-red-core\/([^"'\s)]+\.(?:svg|webp|png|jpe?g))/g,
      )) {
        if (!fs.existsSync(path.join("src", rel)))
          broken.push(`${file}: ${rel}`);
      }
    }
    expect(broken).toEqual([]);
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
