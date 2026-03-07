import mongoose from "mongoose";

const actionLogSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Workspace"
  },
  type: { type: String },
  status: { type: String },
  details: { type: Object }
}, { timestamps: true });

export default mongoose.model("ActionLog", actionLogSchema);
