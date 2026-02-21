import mongoose from "mongoose";

const fileSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Workspace",
    required: true
  },
  path: { type: String, required: true },
  hash: { type: String },
  modified: { type: Boolean, default: false },
  selected: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model("File", fileSchema);
