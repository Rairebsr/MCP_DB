import mongoose from "mongoose";

const pendingActionSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Workspace",
    required: true
  },
  type: {
    type: String,
    enum: [
      "create_repo",
      "git_push",
      "merge_conflict",
      "delete_repo",
      "delete_branch",
      "close_pr",
      "merge_pr"
    ],
    required: true
  },
  stage: { 
    type: String, 
    required: true,
    default: "awaiting_confirmation" // 🟢 Good practice to have a default
  },
  // 🟢 Mixed allows for the flexible { repoName, branchName } structure
  data: { 
    type: mongoose.Schema.Types.Mixed, 
    default: {} 
  },
  // 🟢 Optional: Auto-expire pending actions after 10 minutes 
  // so the DB doesn't get cluttered with abandoned "yes/no" requests.
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 10 * 60 * 1000),
    index: { expires: 0 }
  }
}, { timestamps: true });

export default mongoose.model("PendingAction", pendingActionSchema);