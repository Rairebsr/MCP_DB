import express from "express";
import multer from "multer";
import { uploadFile } from "../services/fileService.js";

const router = express.Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const targetPath = req.body.targetPath || "."; // Default to root workspace

    if (!file) return res.status(400).json({ success: false, error: "No file" });

    const base64 = file.buffer.toString("base64");
    
    // Pass the targetPath (e.g. "src/utils") to the service
    const result = await uploadFile(file.originalname, base64, targetPath);
    
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
