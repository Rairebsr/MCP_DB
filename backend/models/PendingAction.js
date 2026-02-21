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
      "delete_repo"
    ],
    required: true
  },
  stage: { type: String, required: true },
  data: { type: Object, default: {} }
}, { timestamps: true });

export default mongoose.model("PendingAction", pendingActionSchema);
