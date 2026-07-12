// Copies the Tauri build outputs into dist/ as a .app, .dmg, and .zip.
import { existsSync, mkdirSync, rmSync, cpSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundleDir = join(root, "src-tauri", "target", "release", "bundle");
const macosDir = join(bundleDir, "macos");
const dmgDir = join(bundleDir, "dmg");
const distDir = join(root, "dist");

const appName = "Text to Write.app";
const appPath = join(macosDir, appName);
if (!existsSync(appPath)) {
  console.error(`Build output not found at ${appPath}. Run "npm run tauri build" first.`);
  process.exit(1);
}

const dmgFile = readdirSync(dmgDir).find((f) => f.endsWith(".dmg"));
if (!dmgFile) {
  console.error(`No .dmg found in ${dmgDir}.`);
  process.exit(1);
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

cpSync(appPath, join(distDir, appName), { recursive: true });
cpSync(join(dmgDir, dmgFile), join(distDir, "Text to Write.dmg"));

execFileSync("ditto", [
  "-c", "-k", "--keepParent",
  join(distDir, appName),
  join(distDir, "Text to Write.app.zip"),
]);

console.log(`Packaged dist/:\n${readdirSync(distDir).map((f) => `  ${f}`).join("\n")}`);
