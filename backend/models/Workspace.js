import mongoose from "mongoose";

const workspaceSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  rootPath: { type: String, required: true },
  activeRepoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Repo"
  }
}, { timestamps: true });

export default mongoose.model("Workspace", workspaceSchema);
