import express from 'express';
import { readFileAndSync, writeFileAndSync,listFilesAndSync,uploadFileAndSync,createDirectory } from '../services/fs.service.js';
import Workspace from "../models/Workspace.js";
import multer from "multer";
const upload = multer();
const router = express.Router();

// Helper to ensure Workspace exists
async function getOrCreateWorkspace(userId) {
  let workspace = await Workspace.findOne({ userId });
  if (!workspace) {
    workspace = await Workspace.create({
      userId: userId,
      rootPath: `/workspace/${userId}` 
    });
  }
  return workspace;
}

// LIST FILES
router.post("/list", async (req, res, next) => {
  try {
    const userId = req.headers["x-user-id"];
    const workspace = await getOrCreateWorkspace(userId);
    const files = await listFilesAndSync(workspace._id, req.body.path || ".");
    res.json(files);
  } catch (err) { next(err); }
});

// READ FILE
router.post("/read", async (req, res, next) => {
  try {
    const userId = req.headers["x-user-id"];
    const workspace = await getOrCreateWorkspace(userId);
    const result = await readFileAndSync(workspace._id, req.body.path);
    res.json(result); // returns { content, doc }
  } catch (err) { next(err); }
});

// WRITE FILE
router.post("/write", async (req, res, next) => {
  try {
    const userId = req.headers["x-user-id"];
    const { path, content, lastKnownHash } = req.body;
    const workspace = await getOrCreateWorkspace(userId);
    
    const doc = await writeFileAndSync(workspace._id, path, content, lastKnownHash);
    res.json({ success: true, doc });
  } catch (err) {
    if (err.message === "MERGE_CONFLICT") {
      return res.status(409).json({ error: "Conflict detected", currentHash: err.currentHash });
    }
    next(err);
  }
});

// UPLOAD FILE
// backend/routes/files.js
router.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    const userId = req.headers["x-user-id"];
    const file = req.file;
    // Capture the path from the frontend
    const targetPath = req.body.targetPath || "."; 

    if (!file) return res.status(400).json({ success: false, error: "No file" });

    const workspace = await getOrCreateWorkspace(userId);
    const base64 = file.buffer.toString("base64");
    
    // 🔥 CHANGE: Pass targetPath as the 4th argument
    const result = await uploadFileAndSync(workspace._id, file.originalname, base64, targetPath);
    
    res.json({ success: true, result });
  } catch (err) { next(err); }
});

// backend/routes/files.js

router.post("/mkdir", async (req, res, next) => {
  try {
    const userId = req.headers["x-user-id"];
    const { path: folderPath } = req.body;
    
    const workspace = await getOrCreateWorkspace(userId);
    
    // Convert workspace._id to string just to be safe for any DB operations
    const result = await createDirectory(workspace._id.toString(), folderPath); 
    
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

export default router;