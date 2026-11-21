// Import v12-era DLC content that the standalone DLC module dropped.
//
// Usage: node tools/dlc/import-legacy.mjs path/to/fvtt-cyberpunk-red-core
// The checkout must be at tag v0.89.2 (the last Foundry v12 release, which
// still shipped the DLC packs inside the system).
//
// Only packs listed in LEGACY_PACKS are imported. Each keeps its v12 pack
// name, so compendium links made in v12 worlds keep resolving. Old-format
// RollTables (one YAML per result) are converted to the embedded-result
// layout used by Foundry v13+.
import fs from "fs-extra";
import path from "node:path";
import yaml from "js-yaml";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DLC_DIR } from "./dlc.mjs";

const LEGACY_PACKS = ["dlc_hardened-enemies"];
const FOLDER = "Cyberpunk RED: DLC";

const root = fileURLToPath(new URL("../../", import.meta.url));
const legacyDir = path.join(root, "src", DLC_DIR, "legacy");
const core = path.resolve(process.argv[2] ?? "");
const manifest = fs.readJSONSync(path.join(core, "src", "system.json"));
if (manifest.id !== "cyberpunk-red-core") {
  throw new Error(`${core} is not the cyberpunk-red-core repository.`);
}

const yamlOptions = {
  indent: 2,
  sortKeys: true,
  lineWidth: 80,
  noRefs: true,
  quotingType: '"',
};
const load = (file) => yaml.load(fs.readFileSync(file, "utf8"));

function convertTable(table, resultsById) {
  return {
    ...table,
    flags: table.flags ?? {},
    results: table.results.map((id) => {
      const { text, documentId, ...result } = resultsById.get(id);
      delete result.documentCollection; // v13+ uses documentUuid
      if (result.type !== "text" || documentId) {
        throw new Error(`Unsupported result ${id}; only text results.`);
      }
      return {
        ...result,
        _key: `!tables.results!${table._id}.${id}`,
        description: text ?? "",
        flags: result.flags ?? {},
        name: "",
      };
    }),
  };
}

const packs = [];
fs.emptyDirSync(path.join(legacyDir, "packs"));
for (const name of LEGACY_PACKS) {
  const meta = manifest.packs.find((p) => p.name === name);
  if (!meta) throw new Error(`${name} is not in ${core} system.json`);
  const from = path.join(core, "src", meta.path);
  const rel = `${DLC_DIR}/legacy/packs/${path.basename(meta.path)}`;
  const out = path.join(root, "src", rel);
  fs.ensureDirSync(out);

  const files = fs.readdirSync(from).filter((f) => f.endsWith(".yaml"));
  const docs = files.map((f) => load(path.join(from, f)));
  const results = new Map(
    docs
      .filter((d) => d._key?.startsWith("!tables.results!"))
      .map((d) => [d._id, d]),
  );
  for (const doc of docs.filter((d) => d._key?.startsWith("!tables!"))) {
    const slug = doc.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    fs.writeFileSync(
      path.join(out, `table.${slug}.yaml`),
      yaml.dump(convertTable(doc, results), yamlOptions),
    );
  }
  packs.push({ ...meta, path: rel, label: `${meta.label} (v12)` });
}

const git = (...args) =>
  execFileSync("git", args, { cwd: core, encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
const version = git("describe", "--tags", "--always");
fs.writeJSONSync(
  path.join(legacyDir, "legacy.json"),
  {
    source: { repository: manifest.url, version, commit },
    packFolders: [{ name: FOLDER, packs: packs.map((p) => p.name) }],
    packs,
  },
  { spaces: 2 },
);
console.log(`Imported ${packs.length} legacy pack(s) into src/dlc/legacy`);
