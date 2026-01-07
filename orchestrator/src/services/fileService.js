import fs from "fs/promises";
import path from "path";

const WORKSPACE = path.resolve(process.cwd(), "..", "mcp_workspace");
const MAX_FILE_SIZE = 1000 * 1024; // 1000 KB

function resolveSafePath(relativePath) {
  const resolved = path.resolve(WORKSPACE, relativePath);

  if (!resolved.startsWith(WORKSPACE)) {
    throw new Error("Invalid file path");
  }

  return resolved;
}

// Existing function — unchanged
export async function listFiles(relativePath = ".") {
  const dirPath = resolveSafePath(relativePath);

  const stat = await fs.stat(dirPath);
  if (!stat.isDirectory()) {
    throw new Error("Path is not a directory");
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  return entries.map(e => ({
    name: e.name,
    type: e.isDirectory() ? "dir" : "file"
  }));
}


// NEW: read_file support
export async function readFile(relativePath) {
  if (!relativePath) {
    throw new Error("File path is required");
  }

  const filePath = resolveSafePath(relativePath);

  const stat = await fs.stat(filePath);

  if (!stat.isFile()) {
    throw new Error("Path is not a file");
  }

  if (stat.size > MAX_FILE_SIZE) {
    throw new Error("File too large to read");
  }

  return await fs.readFile(filePath, "utf-8");
}
export async function writeFile(relativePath, content) {
  if (!relativePath) {
    throw new Error("File path is required");
  }

  if (typeof content !== "string") {
    throw new Error("Content must be text");
  }

  const filePath = resolveSafePath(relativePath);

  if (Buffer.byteLength(content, "utf-8") > MAX_FILE_SIZE) {
    throw new Error("Content too large to write");
  }

  await fs.writeFile(filePath, content, "utf-8");
  return { path: relativePath, bytes: content.length };
}
import { Buffer } from "buffer";

const UPLOAD_DIR = path.resolve(WORKSPACE, "uploads");
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB

export async function uploadFile(filename, contentBase64) {
  if (!filename || !contentBase64) {
    throw new Error("filename and content_base64 are required");
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const filePath = resolveSafePath(path.join("uploads", filename));
  const buffer = Buffer.from(contentBase64, "base64");

  if (buffer.length > MAX_UPLOAD_SIZE) {
    throw new Error("Upload too large");
  }

  await fs.writeFile(filePath, buffer);
  return { path: `uploads/${filename}`, bytes: buffer.length };
}
