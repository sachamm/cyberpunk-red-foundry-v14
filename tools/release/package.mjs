import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import { releaseVersion, REPOSITORY } from "./config.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const source = JSON.parse(fs.readFileSync(path.join(root, "src/system.json")));
const version = releaseVersion(process.argv[2] ?? source.version);
const output = path.join(root, "dist", "release");
const staging = path.join(root, "dist", "staging", source.id);
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
execFileSync(process.execPath, ["node_modules/gulp/bin/gulp.js", "build"], {
  cwd: root,
  env: { ...process.env, CPR_RELEASE_VERSION: version },
  stdio: "inherit",
});
for (const name of [
  "LICENCE.md",
  "CREDITS.md",
  "README.md",
  "AI_POLICY.md",
  "CHANGELOG.md",
  "RELEASING.md",
]) {
  fs.copyFileSync(path.join(root, name), path.join(staging, name));
}
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const provenance = {
  repository: REPOSITORY,
  version,
  commit: git("rev-parse", "HEAD"),
  dirty: Boolean(git("status", "--porcelain")),
};
fs.writeFileSync(
  path.join(staging, "build-info.json"),
  `${JSON.stringify(provenance, null, 2)}\n`,
);
const manifest = JSON.parse(fs.readFileSync(path.join(staging, "system.json")));
const assetPaths = [
  ...manifest.esmodules,
  ...manifest.styles.map((s) => (typeof s === "string" ? s : s.src)),
  ...manifest.languages.map((l) => l.path),
  ...manifest.packs.map((p) => p.path),
  manifest.license,
];
for (const asset of assetPaths) {
  const resolved = path.resolve(staging, asset);
  if (
    !resolved.startsWith(`${staging}${path.sep}`) ||
    !fs.existsSync(resolved)
  ) {
    throw new Error(`Missing or unsafe manifest asset: ${asset}`);
  }
}
if (
  manifest.version !== version ||
  Object.values(manifest.compatibility).some((v) => v !== 14)
) {
  throw new Error(
    "Release must use the requested version and target only Foundry v14.",
  );
}
if (
  /DUMMY_VALUE|example\.com|gitlab\.com\/api/.test(JSON.stringify(manifest))
) {
  throw new Error(
    "Distribution manifest contains placeholder or upstream update URLs.",
  );
}
const zipName = `${source.id}-${version}.zip`;
const zip = new AdmZip();
zip.addLocalFolder(staging);
zip.writeZip(path.join(output, zipName));
// Read the archive back, including CRC verification, before exposing the manifest.
const archive = new AdmZip(path.join(output, zipName));
if (
  !archive.test() ||
  archive.readAsText("system.json") !==
    fs.readFileSync(path.join(staging, "system.json"), "utf8")
) {
  throw new Error(
    "Install archive failed integrity or root manifest validation.",
  );
}
fs.copyFileSync(
  path.join(staging, "system.json"),
  path.join(output, "system.json"),
);
// Include corresponding source from this working tree, including uncommitted changes.
// Only Git-visible files qualify, so ignored local configuration and runtimes stay private.
const sources = new AdmZip();
const files = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { cwd: root },
)
  .toString()
  .split("\0")
  .filter(Boolean);
for (const name of new Set(files)) {
  const file = path.join(root, name);
  if (fs.existsSync(file) && fs.statSync(file).isFile())
    sources.addFile(name, fs.readFileSync(file));
}
const sourceName = `${source.id}-${version}-source.zip`;
sources.addFile(
  "build-info.json",
  Buffer.from(`${JSON.stringify(provenance, null, 2)}\n`),
);
sources.writeZip(path.join(output, sourceName));
const sums = [zipName, sourceName, "system.json"]
  .map(
    (name) =>
      `${createHash("sha256")
        .update(fs.readFileSync(path.join(output, name)))
        .digest("hex")}  ${name}`,
  )
  .join("\n");
fs.writeFileSync(path.join(output, "SHA256SUMS"), `${sums}\n`);
console.log(
  `Validated release artifacts: ${output}\nVersion: ${version}; dirty source: ${provenance.dirty}`,
);
