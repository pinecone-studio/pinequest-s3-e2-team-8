import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");
const distDir = path.join(rootDir, ".aws-dist");

const workers = [
  {
    folder: path.join(distDir, "exam-worker"),
    zip: path.join(distDir, "exam-worker.zip"),
  },
  {
    folder: path.join(distDir, "learning-worker"),
    zip: path.join(distDir, "learning-worker.zip"),
  },
];

await mkdir(distDir, { recursive: true });

for (const worker of workers) {
  await rm(worker.zip, { force: true });
  const files = await readdir(worker.folder);
  if (files.length === 0) {
    throw new Error(`Worker bundle is empty: ${worker.folder}`);
  }

  await execFileAsync(
    "zip",
    ["-q", "-r", worker.zip, "."],
    { cwd: worker.folder },
  );
}

console.info("Packaged AWS worker zip files:", {
  exam: path.join(".aws-dist", "exam-worker.zip"),
  learning: path.join(".aws-dist", "learning-worker.zip"),
});
