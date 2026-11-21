// Import (or re-sync) the upstream Cyberpunk RED DLC module into src/dlc/.
//
// Usage: node tools/dlc/import.mjs [path/to/fvtt-cyberpunk-red-dlc]
// Without an argument, foundryconfig.json `repos.dlc` is used.
//
// The upstream module's packs, icons, assets, Babele translations, licence
// and credits are copied verbatim except that references to the module
// (`modules/cyberpunk-red-dlc/…`, `Compendium.cyberpunk-red-dlc.…`) are
// rewritten to point at their bundled location inside this system. Pack
// names are kept as-is so upstream changes stay easy to diff.
import fs from "fs-extra";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DLC_DIR } from "./dlc.mjs";

const UPSTREAM_ID = "cyberpunk-red-dlc";
const SYSTEM_ID = "cyberpunk-red-core";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dest = path.join(root, "src", DLC_DIR);

function upstreamDir() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  const cfg = path.join(root, "foundryconfig.json");
  const dir = fs.existsSync(cfg) ? fs.readJSONSync(cfg).repos?.dlc : undefined;
  if (!dir) {
    throw new Error(
      "Pass the DLC repo path or set repos.dlc in foundryconfig.json.",
    );
  }
  return path.resolve(dir);
}

const rewrite = (text) =>
  text
    .replaceAll(`modules/${UPSTREAM_ID}/`, `systems/${SYSTEM_ID}/${DLC_DIR}/`)
    .replaceAll(`Compendium.${UPSTREAM_ID}.`, `Compendium.${SYSTEM_ID}.`);

const TEXT_EXTS = new Set([".yaml", ".yml", ".json"]);

function copyTree(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    // Babele files are keyed by pack collection id, which changes package.
    const name = entry.name.startsWith(`${UPSTREAM_ID}.`)
      ? `${SYSTEM_ID}.${entry.name.slice(UPSTREAM_ID.length + 1)}`
      : entry.name;
    const out = path.join(to, name);
    if (entry.isDirectory()) {
      fs.ensureDirSync(out);
      copyTree(src, out);
    } else if (TEXT_EXTS.has(path.extname(entry.name))) {
      fs.writeFileSync(out, rewrite(fs.readFileSync(src, "utf8")));
    } else {
      fs.copyFileSync(src, out);
    }
  }
}

const upstream = upstreamDir();
const srcDir = path.join(upstream, "src");
const moduleJson = fs.readJSONSync(path.join(srcDir, "module.json"));
if (moduleJson.id !== UPSTREAM_ID) {
  throw new Error(`${upstream} is not the ${UPSTREAM_ID} repository.`);
}

// Keep the hand-written README; everything else is replaced.
const readme = path.join(dest, "README.md");
const readmeText = fs.existsSync(readme) ? fs.readFileSync(readme) : null;
fs.emptyDirSync(dest);
if (readmeText) fs.writeFileSync(readme, readmeText);
for (const dir of ["packs", "icons", "assets", "babele"]) {
  const from = path.join(srcDir, dir);
  if (!fs.existsSync(from)) continue;
  fs.ensureDirSync(path.join(dest, dir));
  copyTree(from, path.join(dest, dir));
}
for (const doc of ["LICENCE.md", "CREDITS.md"]) {
  fs.writeFileSync(
    path.join(dest, doc),
    rewrite(fs.readFileSync(path.join(upstream, doc), "utf8")),
  );
}

// Re-home each pack under src/dlc/ and drop folder entries that name packs
// the module never defines (upstream lists black-chrome_programs and
// black-chrome_rolltables in a folder but ships no such packs).
const packs = moduleJson.packs
  .filter((p) => fs.existsSync(path.join(srcDir, p.path)))
  .map((p) => ({ ...p, path: `${DLC_DIR}/${p.path}`, system: SYSTEM_ID }));
const names = new Set(packs.map((p) => p.name));
const packFolders = moduleJson.packFolders
  .map((f) => ({ ...f, packs: f.packs.filter((n) => names.has(n)) }))
  .filter((f) => f.packs.length > 0);
fs.writeJSONSync(
  path.join(dest, "dlc.json"),
  { packFolders, packs },
  { spaces: 2 },
);

const git = (...args) =>
  execFileSync("git", args, { cwd: upstream, encoding: "utf8" }).trim();
fs.writeJSONSync(
  path.join(dest, "SOURCE.json"),
  {
    repository: moduleJson.url,
    commit: git("rev-parse", "HEAD"),
    upstreamVersion: moduleJson.version ?? null,
    skippedPackFolderEntries: moduleJson.packFolders
      .flatMap((f) => f.packs)
      .filter((n) => !names.has(n)),
    skippedPacks: moduleJson.packs
      .filter((p) => !names.has(p.name))
      .map((p) => p.name),
  },
  { spaces: 2 },
);

console.log(
  `Imported ${packs.length} DLC packs from ${upstream} into ${path.relative(root, dest)}`,
);
