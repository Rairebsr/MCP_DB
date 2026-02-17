import mongoose from "mongoose";

const repoSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Workspace",
    required: true
  },
  url: { type: String, required: true },
  
  // The 'source of truth' branch (usually main or master)
  branch: { type: String, default: "main" }, 
  
  // NEW: Tracks which branch the local files are currently switched to
  currentBranch: { type: String, default: "main" },

  // NEW: List of branches known to the system (optional but helpful for AI listing)
  branches: [{ type: String }],

  localPath: { type: String, required: true },
  cloned: { type: Boolean, default: false },
  lastCommit: { type: String }
}, { timestamps: true });

export default mongoose.model("Repo", repoSchema);