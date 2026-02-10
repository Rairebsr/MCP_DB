import fs from "fs/promises";
import path from "path";
import File from "../models/File.js";
import crypto from "crypto";


const WORKSPACE = path.resolve(process.cwd(), "..", "mcp_workspace");

const getHash = (content) => crypto.createHash('sha256').update(content).digest('hex');

// WRITE + CONFLICT CHECK
export const writeFileAndSync = async (workspaceId, relativePath, content, incomingHash) => {
  const fullPath = path.resolve(WORKSPACE, relativePath);
  const existingFile = await File.findOne({ workspaceId, path: relativePath });
  
  // Conflict Detection
  if (existingFile && incomingHash && existingFile.hash !== incomingHash) {
    const error = new Error("MERGE_CONFLICT");
    error.currentHash = existingFile.hash;
    throw error;
  }

  await fs.writeFile(fullPath, content, "utf-8");

  const newHash = getHash(content);
  const updatedDoc = await File.findOneAndUpdate(
    { workspaceId, path: relativePath },
    { hash: newHash, modified: true, selected: true },
    { upsert: true, new: true }
  );

  return updatedDoc;
};

// 1. List Files + Sync to DB
export async function listFilesAndSync(workspaceId, relativePath = ".") {
  const dirPath = path.resolve(WORKSPACE, relativePath);
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  const results = entries.map(e => ({
    name: e.name,
    type: e.isDirectory() ? "dir" : "file"
  }));

  // Optional: Update DB to track that these files exist in this workspace
  for (const item of results) {
    if (item.type === "file") {
      await File.findOneAndUpdate(
        { workspaceId, path: path.join(relativePath, item.name) },
        { updatedAt: new Date() },
        { upsert: true }
      );
    }
  }
  return results;
}

// 2. Read File + Update Hash
export async function readFileAndSync(workspaceId, relativePath) {
  let filePath = path.resolve(WORKSPACE, relativePath);
  
  try {
    // Try to read from the provided path
    const content = await fs.readFile(filePath, "utf-8");
    const hash = getHash(content);
    const doc = await File.findOneAndUpdate(
      { workspaceId, path: relativePath },
      { hash, modified: false },
      { upsert: true, new: true }
    );
    return { content, doc };
  } catch (err) {
    // If not found, and the path doesn't already start with 'uploads'
    if (err.code === 'ENOENT' && !relativePath.startsWith('uploads')) {
      const altPath = path.join('uploads', relativePath);
      const altFilePath = path.resolve(WORKSPACE, altPath);
      
      console.log(`File not found in root, trying: ${altFilePath}`);
      
      const content = await fs.readFile(altFilePath, "utf-8");
      const hash = getHash(content);
      const doc = await File.findOneAndUpdate(
        { workspaceId, path: altPath },
        { hash, modified: false },
        { upsert: true, new: true }
      );
      return { content, doc };
    }
    // If it's still not found or another error, throw it
    throw err;
  }
}

// 3. Upload File (Base64)
export async function uploadFileAndSync(workspaceId, filename, contentBase64) {
  const uploadDir = path.resolve(WORKSPACE, "uploads");
  await fs.mkdir(uploadDir, { recursive: true });

  const relativePath = path.join("uploads", filename);
  const filePath = path.resolve(WORKSPACE, relativePath);
  const buffer = Buffer.from(contentBase64, "base64");

  await fs.writeFile(filePath, buffer);
  
  const hash = getHash(buffer);
  const doc = await File.findOneAndUpdate(
    { workspaceId, path: relativePath },
    { hash, modified: true },
    { upsert: true, new: true }
  );

  return { path: relativePath, bytes: buffer.length, doc };
}