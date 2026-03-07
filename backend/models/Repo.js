import mongoose from "mongoose";

const repoSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Workspace",
    required: true
  },
  url: { type: String, required: true },
  branch: { type: String, default: "main" },
  localPath: { type: String, required: true },
  cloned: { type: Boolean, default: false },
  lastCommit: { type: String }
}, { timestamps: true });

export default mongoose.model("Repo", repoSchema);
