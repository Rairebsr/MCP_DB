import path from "path";
import fs from "fs/promises";

const ROOT = path.resolve(process.cwd(), "mcp_workspace");

export function resolveSafePath(relativePath = ".") {
  const resolved = path.resolve(ROOT, relativePath);

  if (!resolved.startsWith(ROOT)) {
    throw new Error("Path escape attempt blocked");
  }

  return resolved;
}

export async function ensureRoot() {
  await fs.mkdir(ROOT, { recursive: true });
}
