import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const entry = path.resolve(repoRoot, "tests", "run-tests.ts");
const outfile = path.resolve(repoRoot, "dist", "tests-bundle.mjs");

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  sourcemap: "inline",
  target: ["node20"],
});

await import(pathToFileURL(outfile).href);

