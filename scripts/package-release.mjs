#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const rootDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const pluginId = packageJson.name;
const version = packageJson.version;
const buildDir = join(rootDir, "release-build");
const packageDir = join(buildDir, pluginId);
const zipName = `${pluginId}-v${version}.zip`;
const zipPath = join(rootDir, zipName);

for (const path of [buildDir, zipPath]) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

mkdirSync(packageDir, { recursive: true });

for (const requiredPath of ["dist", "package.json", "LICENSE", "icon.svg"]) {
  const sourcePath = join(rootDir, requiredPath);
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing required release file: ${requiredPath}`);
  }
  cpSync(sourcePath, join(packageDir, requiredPath), { recursive: true });
}

execFileSync("zip", ["-r", "-X", zipPath, pluginId], {
  cwd: buildDir,
  stdio: "inherit",
});

rmSync(buildDir, { recursive: true, force: true });
console.log(`Created ${zipName}`);
