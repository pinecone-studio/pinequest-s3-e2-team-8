import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");
const outDir = path.join(rootDir, ".aws-dist");

const workers = [
  {
    entry: path.join(rootDir, "workers/aws/exam-worker.ts"),
    outfile: path.join(outDir, "exam-worker/index.js"),
  },
  {
    entry: path.join(rootDir, "workers/aws/learning-worker.ts"),
    outfile: path.join(outDir, "learning-worker/index.js"),
  },
];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const worker of workers) {
  await mkdir(path.dirname(worker.outfile), { recursive: true });
  await build({
    entryPoints: [worker.entry],
    outfile: worker.outfile,
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node22",
    sourcemap: true,
    logLevel: "info",
    tsconfig: path.join(rootDir, "tsconfig.json"),
  });
}

console.info(`Built AWS workers into ${outDir}`);
