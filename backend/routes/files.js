import express from 'express';
import { readFileAndSync, writeFileAndSync,listFilesAndSync,uploadFileAndSync } from '../services/fs.service.js';
import Workspace from "../models/Workspace.js";
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
router.post("/upload", async (req, res, next) => {
  try {
    const userId = req.headers["x-user-id"];
    const { filename, content_base64 } = req.body;
    const workspace = await getOrCreateWorkspace(userId);
    const result = await uploadFileAndSync(workspace._id, filename, content_base64);
    res.json(result);
  } catch (err) { next(err); }
});

export default router;