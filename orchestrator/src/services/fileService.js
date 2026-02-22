import { Buffer } from "buffer";
import path from "path";
import fs from "fs/promises";


const WORKSPACE = path.resolve(process.cwd(), "..", "mcp_workspace");

function resolveSafePath(relativePath) {
  const resolved = path.resolve(WORKSPACE, relativePath);

  if (!resolved.startsWith(WORKSPACE)) {
    throw new Error("Invalid file path");
  }

  return resolved;
}

const UPLOAD_DIR = path.resolve(WORKSPACE, "uploads");
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB

export async function uploadFile(filename, contentBase64, subFolder = ".") {
  if (!filename || !contentBase64) {
    throw new Error("filename and content_base64 are required");
  }

  // Resolve where the file should actually go
  // If subFolder is "src/components", targetDir is "mcp_workspace/src/components"
  const targetDir = resolveSafePath(subFolder);
  
  await fs.mkdir(targetDir, { recursive: true });

  const filePath = path.join(targetDir, filename);
  const buffer = Buffer.from(contentBase64, "base64");

  if (buffer.length > MAX_UPLOAD_SIZE) {
    throw new Error("Upload too large");
  }

  await fs.writeFile(filePath, buffer);
  
  // Return the relative path for the frontend to track
  return { path: path.join(subFolder, filename), bytes: buffer.length };
}
