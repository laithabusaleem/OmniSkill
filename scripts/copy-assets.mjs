import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcData = join(root, "src", "data");
const distData = join(root, "dist", "data");

if (!existsSync(srcData)) {
  console.error("Missing src/data — cannot copy runtime assets");
  process.exit(1);
}

mkdirSync(distData, { recursive: true });
cpSync(srcData, distData, { recursive: true });
console.log("Copied runtime assets to dist/data");
