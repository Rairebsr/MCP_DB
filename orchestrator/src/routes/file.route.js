/*
import express from "express";
import { listFiles } from "../services/fileService.js";

const router = express.Router();

router.post("/list", async (req, res) => {
  try {
    const files = await listFiles();
    res.json({ success: true, files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
*/
import express from "express";
import multer from "multer";
import { uploadFile } from "../services/fileService.js";

const router = express.Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });

router.post("/upload", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ success: false });

  const base64 = file.buffer.toString("base64");
  const result = await uploadFile(file.originalname, base64);
  res.json({ success: true, result });
});

export default router;
