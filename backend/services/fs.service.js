import fs from "fs/promises";
import path from "path";
import File from "../models/File.js";
import crypto from "crypto";


const WORKSPACE = path.resolve(process.cwd(), "..", "mcp_workspace");

const getHash = (content) => crypto.createHash('sha256').update(content).digest('hex');

// Add this inside fs.service.js if it's missing
function resolveSafePath(relativePath) {
  const resolved = path.resolve(WORKSPACE, relativePath);
  if (!resolved.startsWith(WORKSPACE)) {
    throw new Error("Invalid file path");
  }
  return resolved;
}

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
// ... imports ...

// Helper to recursively find a file
async function findFileInWorkspace(currentPath, filename) {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullEntryPath = path.join(currentPath, entry.name);
    
    // Check if this is the file we are looking for
    if (entry.isFile() && entry.name === filename) {
      return fullEntryPath;
    }
    
    // If directory, search inside (limit depth to avoid taking too long)
    if (entry.isDirectory() && entry.name !== ".git" && entry.name !== "node_modules") {
      const found = await findFileInWorkspace(fullEntryPath, filename);
      if (found) return found;
    }
  }
  return null;
}

// 2. Read File + Smart Search
export async function readFileAndSync(workspaceId, relativePath) {
  // 1. Try direct path first (e.g., "Autonomous-Emergency-Braking/aeb_node.py")
  let targetPath = path.resolve(WORKSPACE, relativePath);

  try {
    await fs.access(targetPath); // Check if exists
  } catch (err) {
    // 2. If not found, try to find it by name (Smart Search)
    const filename = path.basename(relativePath);
    console.log(`🔍 File ${relativePath} not found. Searching workspace for ${filename}...`);
    
    const foundPath = await findFileInWorkspace(WORKSPACE, filename);
    
    if (foundPath) {
      targetPath = foundPath;
      // Update relativePath for the DB record
      relativePath = path.relative(WORKSPACE, foundPath); 
    } else {
      throw err; // Genuine 404
    }
  }

  // 3. Read and Return
  const content = await fs.readFile(targetPath, "utf-8");
  const hash = getHash(content);
  
  const doc = await File.findOneAndUpdate(
    { workspaceId, path: relativePath },
    { hash, modified: false },
    { upsert: true, new: true }
  );

  return { content, doc };
}

// backend/services/fs.service.js
export async function uploadFileAndSync(workspaceId, filename, contentBase64, subFolder = ".") {
  // 1. Resolve the path based on the folder the user is in
  const targetDir = resolveSafePath(subFolder);
  
  // 2. Ensure that specific folder exists on disk
  await fs.mkdir(targetDir, { recursive: true });

  // 3. Define the physical and relative paths
  const relativePath = path.join(subFolder, filename);
  const filePath = path.join(targetDir, filename);
  
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


// Add this to your backend/services/fileService.js

// backend/services/fs.service.js

export async function createDirectory(workspaceId, relativePath) {
  if (!relativePath) {
    throw new Error("Directory path is required");
  }

  // Ensure relativePath is used with resolveSafePath
  // The error happened because path.resolve was likely receiving the workspace object
  const fullPath = resolveSafePath(relativePath); 

  try {
    await fs.mkdir(fullPath, { recursive: true });
    return { success: true, path: relativePath };
  } catch (err) {
    throw new Error(`Failed to create directory: ${err.message}`);
  }
}